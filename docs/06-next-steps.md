# 次のステップ — 簡易実装と検証・判断ポイント

方針: **小さく作って動かして判断する**。
アーキテクチャは仮説。実装してみてから簡素化・統合を判断する。

---

## Step 1: `saveRow` エラー表示（小・1〜2時間）

**やること**:
`RowEditorPanel` で `saveRow()` の戻り値を受け取り、エラーをインラインで表示する。

```typescript
// RowEditorPanel.tsx
const result = saveRow(row.rowId, buffer as AfterValues)
if (!result.ok) {
  setSaveErrors(result.errors)  // 新しい state
}
```

**判断ポイント**:
`saveRow` は `DirectEditOperation.validate()` → `validateRow()` を呼ぶ。
しかし実際に error が返るケースはほぼない（UI の disabled と入力補助で先に防ぐため）。

→ **エラーが一度も出ないなら `validateRow()` の `error` レベルが厳しすぎるか、UI の disabled が重複している。**
どちらかを削れる可能性がある。

---

## Step 2: コードリスト値バリデーション追加（小・半日）

**やること**:
`validateRow()` の `_codeLists` を実際に使って、
「組織コードがコードリストに存在するか」「等級コードが有効か」等を追加する。

```typescript
// validateRow.ts
export function validateRow(row, orgs, codeLists): ValidationIssue[] {
  return [
    ...validateDepartmentCode(row, orgs),
    ...validateBandCode(row, codeLists),       // ← 追加
    ...validateEmploymentType(row, codeLists), // ← 追加
    ...
  ]
}
```

**判断ポイント**:
コードリストはユーザーが Excel からインポートしたものに依存する。
インポートが不完全だとほぼ全行でエラーが出る可能性がある。

→ **全部 `warning` にして `error` は「明らかに壊れている場合だけ」に絞るのが現実的かも確認する。**

---

## Step 3: 操作ハンドラー 2〜3種類（中・2〜3日）

**やること**:
`MoveToOrg` と `Promote` を実装してみる。UIから呼べるようにする。

```typescript
// handlers/moveToOrg.ts
export class MoveToOrgOperation implements IDomainOperation {
  validate(ctx): ValidationResult { ... }
  apply(ctx): OperationResult { ... }
}
```

`useStore.ts` に `executeOperation` を公開:
```typescript
executeOperation: (op: IDomainOperation) => ValidationResult
```

**判断ポイント — アーキテクチャ簡素化の判断をここでする**:

実装してみると `validate()` が「対象行が存在するか」「組織コードが有効か」だけになる操作が多い。
`validateRow()` と内容が重複するなら:

| 判断 | 条件 | 対応 |
|---|---|---|
| **分離を維持** | `validate()` に「この操作固有の前提チェック」が明確にある | 現状維持 |
| **統合を検討** | `validate()` が `validateRow(apply結果)` と同等になる | `IDomainOperation` から `validate()` を除いて `apply()` 後に `validateRow()` を一括でかける設計に変更 |

`validate()` を除いた場合のシンプルな代替:

```typescript
// 簡素版: apply してから validateRow にかける
const applied = op.apply(ctx)
const issues  = applied.updatedList.flatMap(r => validateRow(r, orgs, codeLists))
const errors  = issues.filter(i => i.level === 'error')
if (errors.length > 0) return { ok: false, errors }
// OKなら checkpoint → state 更新
```

→ **操作ハンドラーを 2〜3個書いた後、`validate()` が独自ロジックを持つかどうかで判断する。**

---

## Step 4: AI API 接続（中・2〜3日）

**やること**:
`AIChatDrawer` を Claude API（Tool Use）に実際に繋ぐ。

### 2つのアプローチを検討

**アプローチ A: Tool Use（構造的）**

```
AIChatDrawer → Claude API (tool_use) → aiTools.findPersons / executeOperation
```

- AI が操作を確実に実行できる
- ハンドラー（Step 3）が整っていないと提案できる操作が限られる
- 実装量: 多（ツール定義 JSON + ループ処理）

**アプローチ B: コンテキスト注入（シンプル）**

```
AIChatDrawer → Claude API (通常の chat)
  system prompt に現在の状態サマリーを注入
  → AI は「田中さんを営業部に異動」等をテキストで提案
  → ユーザーが確認して UI で操作する
```

- 実装がシンプル（ほぼ fetch + メッセージ管理のみ）
- AI が直接状態を変更しないので安全
- 操作ハンドラーが揃っていなくても使える

**判断ポイント**:

→ **まず B（コンテキスト注入）で動かして価値を確認してから A（Tool Use）に移行するかを決める。**
「AI が操作を提案するだけで十分」ならBで完結する可能性もある。

---

## Pattern Detection についての判断

**現状**: `IOperationPattern`・`matchAllPatterns()`・`patternCache` が実装済みだが、
パターン実装が 0 個・登録も呼ばれていない。完全に死んでいる。

**選択肢**:

| 選択肢 | 判断基準 |
|---|---|
| **削除する** | AI が Tool Use で操作を判断するなら、パターン判定は AI に任せればよい（重複） |
| **維持してStep 4後に判断** | AI なしで「Excel を読んだ時に操作種別を自動推定したい」なら必要 |

→ **AI 接続（Step 4）が完成した後、パターン判定がまだ必要かを判断する。**
不要なら `patternCache`・`registerPatterns()`・`operationPatterns/` を丸ごと削除する。

---

## SuccessFactors への判断

`IAllocationDataSource` / `IAllocationExporter` は定義したが現時点では使われていない。

→ **SF が具体的な要件になってから実装する。今は ports/ のインターフェース定義だけで十分。**
必要になった時にアダプターを追加するだけ。

---

## アーキテクチャ全体の簡素化候補（Step 3 後に判断）

Step 3 まで終わった時点でこれらを判断する:

```
削除候補:
  src/domain/operationGroups/   ← barrel だけになっている。import 元を直接参照に変える
  patternCache / registerPatterns  ← AI で代替できるなら削除
  IDomainOperation.validate()  ← apply後にvalidateRowで代替できるなら削除

統合候補:
  IAllocationDataSource        ← SF が遠ければ ports/ から一時的に除去
  createAITools(service)       ← テストを書かないなら singleton で十分
```

---

## 優先順位まとめ

```
今すぐ着手:
  Step 1: saveRow エラー表示         → 小。すぐわかる
  Step 2: コードリスト値バリデーション → 小。実用性が上がる

次のスプリント:
  Step 3: MoveToOrg + Promote ハンドラー → アーキテクチャ判断の材料になる
  Step 4: AI 接続（まず B 方式）         → 価値検証

Step 3+4 完了後:
  → Pattern Detection の要否を判断
  → IDomainOperation.validate() の要否を判断
  → operationGroups barrel の削除
```
