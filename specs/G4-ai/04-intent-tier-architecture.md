# G4-04 Intent-First + Tier 実行アーキテクチャ

> 実装前に必ず読み、「注意事項」セクションを確認すること。

---

## 背景・現状の問題

現在の `agentRunner.ts` は「全ツール公開 → AI が tool call で情報収集を繰り返す」設計。
以下の問題がある：

1. **システムプロンプトが機能していない**
   - `agentRunner.ts` は `systemPrompt` オプションを受け取れるが、
     `scenarios/` のどのファイルもそれを渡していない。
   - `specs/G4-ai/02-system-prompt-rules.md` に書かれた業務ルールが AI に伝わっていない。

2. **`getFieldOptions` が未登録**
   - `src/application/aiTools/read.ts` に実装済みだが `toolRegistry.ts` に登録されていない。
   - AI がフィールドの有効値を確認できず、不正な値を設定するリスクがある。

3. **ツール往復が多い**
   - `findPersons` → `getOrgMembers` → `propose_transfer` で 3 往復が典型例。
   - セッション状態をプロンプトに注入するだけで 2〜3 回削減できる。

4. **`scenarios/` が agentRunner を使っていない**
   - 現在の `scenarios/reviewSummary.ts` 等は mock ベースのテキスト生成のみ。
   - 実際の Claude/LLM 呼び出しとは独立している（意図的かは要確認）。

5. **フィールドリネームが toolRegistry に未反映**
   - `leaveFlag` → `leaveOfAbsenceSign` のリネームが説明文に残っている可能性がある。
   - 実装前に `toolRegistry.ts` の全 `description` を grep して確認すること。

---

## 設計：Intent-First + Tier 実行

### Step 1: Intent Classification（第 1 プロンプト）

ツール呼び出しなし、構造化出力で意図を分類する。

```typescript
// リクエスト
{
  model: ...,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'intent',
      schema: {
        type: 'object',
        properties: {
          tier:              { enum: ['guide', 'simple_write', 'wizard'] },
          intent:            { type: 'string' },   // 'transfer' | 'promote' | 'check_org' | ...
          params:            { type: 'object' },   // 既知パラメータ（userId, orgCode等）
          needsClarification:{ type: 'boolean' },
          clarifyQuestion:   { type: 'string' }    // 不足時のみ
        },
        required: ['tier', 'intent', 'needsClarification']
      }
    }
  },
  messages: [
    { role: 'system', content: buildSystemPrompt(snapshot) },
    { role: 'user',   content: userMessage }
  ]
}
```

**⚠️ 注意**: `response_format: json_schema` はカスタム LLM が対応していない場合がある。
対応状況を先に検証すること。未対応なら `json_object` + 指示プロンプトでフォールバック。

---

### Step 2: コンテキスト注入（systemPrompt 構築）

```typescript
function buildSystemPrompt(snapshot: DomainSnapshot): string {
  const diagnosis = computeValidationDiagnosis(snapshot)
  const changed   = snapshot.allocationList.filter(hasChanges)

  return `
## セッション状態（毎回更新）
- 変更行: ${changed.length} 件
- バリデーションエラー: ${diagnosis.errorCount} 件
${diagnosis.byField.slice(0, 5).map(f =>
  `  - ${f.field}: ${f.rowIds.length} 件 → 推奨: ${f.suggestedAction}`
).join('\n')}

## 業務ルール（確定）
- 昇降格時は必ず新ポジションを作成する。既存 positionCode を引き継がない。
- positionCode が "_pos_" で始まる場合は内部採番。Excel 出力時は空欄になる。
- prevXxx フィールド（発令前の状態）は変更しない。
- managerPositionCode の変更には必ず propose_set_manager_position を使う。
  （saveRow で直接変更すると managerName が更新されない）

## AI が行ってはいけないこと
- prevXxx フィールドを直接変更すること
- leaveOfAbsenceSign（休職者サイン）を兼務時に設定すること
- positionCode を "_pos_" prefix なしで自己採番すること
`
}
```

**⚠️ 注意: トークン上限**
- `allocationList` の全行を注入しないこと（数百行になりうる）
- バリデーションも上位 5 フィールドに絞る
- 注入内容は毎リクエストで再計算（キャッシュ不可。OpenAI 互換 API は Anthropic の prompt cache 機能を持たない）

---

### Step 3: Tier 別実行

#### Tier 1: Guide（ツールなし）

```typescript
// システムプロンプト + ユーザーメッセージのみ
// ツール定義を渡さない → AI がツールを呼ぼうとするムダを防ぐ
const response = await client.chat.completions.create({
  tools: undefined,  // ← 意図的に省略
  messages: [system, user],
  stream: true
})
```

#### Tier 2: Simple Write（1〜2 往復）

```typescript
// 1. params が揃っている → 直接 propose
// 2. params 不足 → clarifyQuestion を UI に表示 → 補完後に再実行
// propose_xxx ツールは「確認を得てから実行」の設計なので confirm ステップが自動発生
```

#### Tier 3: Wizard（ステップ分解）

AI が以下の JSON を返す（第 2 プロンプト）：

```typescript
{
  title: '組織統廃合: A部 → B部',
  steps: [
    {
      id: 1,
      label: 'A部全員を B部に異動',
      tool: 'propose_bulk_transfer',
      params: { sourceOrgCode: 'A001', targetOrgCode: 'B001' },
      validationAfter: true  // このステップ後にバリデーション診断を実行
    },
    {
      id: 2,
      label: '上司ポジションを B部に移設',
      tool: 'propose_set_manager_position',
      params: { ... }
    },
    {
      id: 3,
      label: 'バリデーション確認',
      tool: 'getValidationDiagnosis',
      params: {}
    }
  ]
}
```

UI がステップ一覧を表示 → ユーザーが 1 ステップずつ承認 → 実行。

**⚠️ 注意: Wizard の中断**
- ユーザーが途中で離脱する可能性がある
- Undo は `executeOperation` 経由の操作のみ対象（`HRApplicationService` の直接メソッドは Undo 対象外）
- Wizard ステップが失敗したとき、どこまで戻せるか事前に確認が必要

---

### Streaming + 進捗表示

```typescript
const stream = await client.chat.completions.stream({
  tools: [...],
  stream: true,
  ...
})

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta

  // テキスト回答をリアルタイム表示
  if (delta?.content) {
    onProgress({ type: 'text', text: delta.content })
  }

  // ツール呼び出し開始を検知してスピナー表示
  if (delta?.tool_calls?.[0]?.function?.name) {
    const name = delta.tool_calls[0].function.name
    onProgress({ type: 'tool_start', label: TOOL_LABELS[name] ?? name })
  }
}

const TOOL_LABELS: Record<string, string> = {
  findPersons:            '従業員を検索中...',
  getValidationDiagnosis: 'バリデーションを確認中...',
  propose_bulk_transfer:  '一括異動を準備中...',
  // ...
}
```

**⚠️ 注意: streaming と tool call の相互作用**
- OpenAI 互換 streaming では tool call の引数が chunk に分割して届く
- `function.name` は最初の chunk に来るが `function.arguments` は複数 chunk に分かれる
- ツール実行は引数が揃うまで待つ必要がある（`finish_reason: 'tool_calls'` を待つ）
- カスタム LLM によっては streaming 中に tool call が正しく分割されない実装がある。要検証。

---

## 実装順序（推奨）

### Phase A: 基盤修正（既存コードの整合性）
1. `toolRegistry.ts` の `getFieldOptions` 登録
2. `toolRegistry.ts` の全 description を `leaveFlag` → `leaveOfAbsenceSign` に更新
3. `buildSystemPrompt()` 関数を作成し、`reviewSummaryScenario` で渡すようにする

### Phase B: Streaming 実装
4. `agentRunner.ts` に streaming オプションを追加
5. `onProgress` コールバック型を定義してフロント側にイベントを流す
6. `TOOL_LABELS` マップを実装

### Phase C: Intent Classifier
7. `intentClassifier.ts` を新規作成
8. `json_schema` 対応チェック → 非対応なら `json_object` + few-shot にフォールバック
9. `agentRunner.ts` を Tier ルーター に拡張

### Phase D: Wizard UI
10. `WizardStepList` コンポーネント（チャット内ウィジェット）
11. Wizard ステップのキャンセル・Undo フロー

---

## 現状コードの注意点（把握済みの地雷）

| 場所 | 問題 | 対応 |
|---|---|---|
| `agentRunner.ts` L38, L63 | `systemPrompt` を受け取れるが渡されていない | Phase A-3 で修正 |
| `toolRegistry.ts` L105 | `getPersonDetail` の description に `leaveFlag` の概念が古い形で残っている可能性 | 全文 grep して確認 |
| `scenarios/*.ts` | `agentRunner` を使わず mock テキストを返す | Phase D で Wizard 定義に転換 |
| `aiTools/read.ts` L82 | `getFieldOptions` 実装済みだが未登録 | Phase A-1 で登録 |
| `fieldConstraints.ts` | `FIELD_CONSTRAINTS` の `suggestion` vs `constraint` の区別を AI が知らない | Phase A-3 のシステムプロンプトに追記 |

---

## 検証が必要な前提

- [ ] カスタム LLM が `response_format: json_schema` をサポートするか
- [ ] カスタム LLM の streaming 実装が tool call arguments を正しく分割するか
- [ ] `parallel_tool_calls` オプションをサポートするか（並列ツール呼び出しの効率化に使える）
- [ ] システムプロンプトのトークン上限（モデルによって異なる）
