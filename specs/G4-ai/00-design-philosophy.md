# G4-00 AI アダプター設計思想

> このドキュメントは `aiTools.ts` と `toolRegistry.ts` の責務分担と、
> Web コンポーネントと AI が同じドメインを共有しながらも異なる契約を持つ理由を定義する。

---

## 1. 基本構造：同じドメイン、異なるアダプター

```
                    HRApplicationService
                   （Application 境界 — Single Source of Truth）
                  ↗                          ↖
     Web Adapter                          AI Adapter
  （React + Zustand）                 （aiTools.ts）
  ・Zustand subscription（push）       ・getSnapshot()（pull）
  ・buffer で未保存状態を保持           ・常にコミット済み状態のみ参照
  ・フィールド単位のインクリメンタル編集  ・業務意図単位の原子的操作
  ・リアルタイムバリデーション（毎描画）  ・集約バリデーション（ツール呼び出し時）
  ・保存ボタンが確認ゲート              ・confirm ツールがユーザー確認ゲート
```

両アダプターは同じ `IDomainOperation` パイプラインに収束する：

```
executeOperation(op) → validate() → UndoStack → apply() → emit()
```

この収束点より先（ドメイン層）は Web と AI で完全に共有される。

---

## 2. 各ファイルの責務

### `src/application/aiTools.ts` — AI BFF（Backend for Frontend）

AI が必要とするすべてのビジネスロジックを持つ唯一の場所。

**持つべきもの:**
- 検索・読み取り関数（`findPersons`, `getPersonDetail`, `listChangedRows` など）
- 書き込み実行関数（`executeBulkTransfer`, `executeFieldEdit` など）
- 集約バリデーション関数（`getValidationDiagnosis` など）
- 後処理ヘルパー（`runPostValidation` など）

**持つべきでないもの:**
- LLM ツール定義（JSON スキーマ）→ toolRegistry.ts
- ChatWidget の組み立て → toolRegistry.ts
- React/Zustand への参照 → 絶対禁止

### `src/infrastructure/ai/toolRegistry.ts` — LLM プロトコルアダプター

aiTools.ts へのルーティングと、LLM が解釈できる形式への変換のみ行う薄い層。

**持つべきもの:**
- `ToolDefinition`（LLM に渡す name/description/parameters JSON スキーマ）
- `buildProposal()`（confirm ツールの確認ウィジェット組み立て — 読み取り専用の表示ロジック）
- `executeOnApprove()` → **aiTools のメソッドを呼ぶだけ**
- `execute()` → **aiTools のメソッドを呼ぶだけ**

**持つべきでないもの:**
- `IDomainOperation` の直接インスタンス化
- `appService.executeOperation()` の直接呼び出し
- ビジネスロジック（フィルタリング・集計・派生計算）

---

## 3. ツール種別（3-kind タクソノミー）

`agentRunner.ts` が参照する実行プロトコルの分類。

| kind | 副作用 | 戻り値 | ユーザー確認 |
|---|---|---|---|
| `read` | なし | JSON（LLM に返す） | 不要 |
| `render` | なし | `{ summary, widget }`（widget は UI に表示） | 不要 |
| `confirm` | あり（ドメイン変更） | ユーザー承認後に結果 | 必須 |

### `render` の位置づけ

`render` は `read` の亜種であり、「データ + UIウィジェット」を返す。
現状は機能するが将来的に `read` に統合し、戻り値に `widget?` を追加することで廃止できる。

---

## 4. ルール：新しいツールを追加するとき

### ✅ やること

```
1. aiTools.ts にビジネスロジックのメソッドを追加する
2. toolRegistry.ts に ToolEntry を追加し、aiTools のメソッドを呼ぶ
3. read/render/confirm のどれかを選択する
   - 状態を読むだけ → read
   - 状態を読んで Widget も返す → render
   - 状態を変更する → confirm（ユーザー確認付き）
```

### ❌ やってはいけないこと

```
// toolRegistry.ts 内でドメイン操作を直接インスタンス化しない
executeOnApprove: args => {
  appService.executeOperation(new DirectEditOperation(...)) // ← NG
}

// aiTools.ts を経由する
executeOnApprove: args => aiTools.executeFieldEdit(args.userId, args.field, args.value) // ← OK

// toolRegistry.ts 内でビジネスロジックを書かない
execute: args => {
  const rows = allocationList.filter(r => r.userId === args.userId).map(r => ...) // ← NG
}

// aiTools.ts に移してから呼ぶ
execute: args => aiTools.getPersonDetail(args.userId as string) // ← OK
```

---

## 5. Web と AI の対称性・非対称性について

### 対称性が成り立つ層

- ドメイン操作（`IDomainOperation`）— 完全に共有
- バリデーションルール（`VALUE_RULES`, `validateRow`）— 完全に共有
- HRApplicationService のメソッド群 — 完全に共有

### 対称性が成り立たない層（意図的な差異）

| 関心事 | Web | AI |
|---|---|---|
| 状態参照 | Zustand subscription（push） | `getSnapshot()`（pull） |
| バリデーション表示 | 毎描画（`validateRow` 直接呼び出し） | `getValidationDiagnosis()`（集約） |
| 選択肢生成 | `getFieldOptions` を `getOptions()` 経由で毎描画 | `getFieldOptions()` をツールとして呼ぶ |
| 確認ゲート | 保存ボタン（UI ボタン） | `confirm` ツール（チャット内確認） |
| 編集単位 | フィールド単位→インクリメンタル | 業務意図単位（1ツール = 1操作） |

### 操作粒度の意図的な差異

Web と AI は「同じパイプラインを通る」が、**操作の粒度は意図的に異なる**。

```
Web（インクリメンタル編集）          AI（業務意図単位）
──────────────────────────         ──────────────────────────
saveRow(rowId, {band: 'M4'})        executeOrgTransfer(userId, deptCode)
saveRow(rowId, {payGrade: 'G3'})    → validate + 複数フィールド一括更新
saveRow(rowId, {localJobTitle: …})    + 派生フィールド自動補完
  ↓（3回のUndoエントリ）                ↓（1回のUndoエントリ）
```

**Web がインクリメンタルな理由**：
- フィールド単位で即時フィードバック（バリデーション・選択肢）を得られる
- ユーザーがフォーム上で何度も試行錯誤できる
- 保存ボタンが確認ゲートになる

**AI が業務意図単位な理由**：
- LLM とのターンアラウンドを最小化するため、1ツール呼び出しで完結する
- 「組織異動」「昇降格」などの業務的意味が明確になる
- Undo が業務操作単位になる（細かいフィールド編集履歴が残らない）

**実装方針**：

- Web の細粒度編集：`appService.saveRow()` → `DirectEditOperation`（既存）
- AI の粗粒度操作：`appService.executeOrgTransfer()` などの意味的メソッド
  → 内部では `executeOperation(new XxxOperation(...))` を呼ぶ
  → `aiTools.ts` がこれを AI に公開する

パターンダイアログ（UI）は AI の粗粒度操作と同じメソッドを呼んでも良い。
操作の意味的まとまり（複数フィールド + 派生補完）を UI で使いたいときは
`appService.executeOrgTransfer()` を呼ぶことで、AI と同じコードパスを共有できる。

### Web の状態（React State・buffer）をドメインに染み出させない

`RowEditorPanel` の `buffer`（未保存の一時状態）はコンポーネント内でのみ存在する。
ドメイン層は常にコミット済み状態（`allocationList`）のみを知る。
AI も同様に、`getSnapshot()` でコミット済み状態のみを参照する。

---

## 5b. グレーゾーン：toolRegistry の buildProposal が appService を直接参照すること

`buildProposal` は「ユーザーに見せる確認ウィジェット」を組み立てる表示ロジックであり、
副作用を持たない（読み取り専用）。この目的に限り、`appService.getSnapshot()` を
toolRegistry 内で直接呼ぶことを **許容する**。

```
// OK: buildProposal 内の読み取り専用アクセス
buildProposal: args => {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  // ... PersonDiff[] を組み立てる
}

// NG: executeOnApprove 内で appService を介した書き込み
executeOnApprove: args => {
  appService.executeOperation(new DirectEditOperation(...))  // ← aiTools 経由にすること
}
```

同様に、`reDeriveManagerNamesForList` など純粋なドメインヘルパー関数を
buildProposal でのプレビュー計算に使うことも許容する。

---

## 6. 未解決の懸念事項（要検討）

リファクタリング後も残る設計上の懸念事項。優先度順に記載する。

### A. `aiTools.ts` の肥大化（780行）

現状の問題：
- 1ファイルにread/write/review/utility すべてのメソッドが混在している
- CLAUDE.md ルール「1ファイル上限200行」に対して大幅超過

**推奨対応**:
```
src/application/
  aiTools/
    index.ts          ← 外部向け export + createAITools の合成
    read.ts           ← findPersons, getPersonDetail, getOrgTreeData など
    write.ts          ← executeBulkTransfer, executeFieldEdit など
    review.ts         ← getReviewSummary, getValidationDiagnosis など
    orgTree.ts        ← buildOrgTree ヘルパー
```

### B. `buildProposal` ロジックが toolRegistry に混在（量が多い）

toolRegistry.ts 全体 849行のうち、`buildProposal` 実装で約400行を占める。
これは「LLM プロトコルアダプター」という役割に対して重すぎる。

**推奨対応**:
```
src/infrastructure/ai/
  toolRegistry.ts     ← ToolDefinition + routing のみ（thin）
  proposalBuilders.ts ← confirm ツールの buildProposal 実装
```

ただし `proposalBuilders.ts` が `appService` と `PersonDiff` 型を必要とするため、
infrastructure → application の依存が正当化されるか要検討。

### C. `SelectedRowContext` の型が `chatSession.ts` に定義されている

`aiTools.getRowContext()` の戻り値型が `chatSession.ts` から import されている：
```typescript
function getRowContext(rowId: number): import('./chatSession').SelectedRowContext | null
```

`SelectedRowContext` は他の AI 向け型（`PersonDiff` など）と同様に `aiTypes.ts` に置くべき。
**低優先度**。型の移動だけなので影響範囲は小さい。

### D. `propose_create_position.executeOnApprove` が新規行IDを取得するために appService を読む

```typescript
executeOnApprove: args => {
  aiTools.createVacantPosition(orgCode, localJobTitle)
  const snap   = appService.getSnapshot()                // ← read-only だが toolRegistry が直接呼ぶ
  const newRow = [...snap.allocationList].reverse().find(...)
  return { applied: true, newPositionRowId: newRow?.rowId }
},
```

`aiTools.createVacantPosition()` が新規 rowId を返すようにすれば解消できる。
**低優先度**。

---

## 8. 関連ドキュメント

- `specs/G4-ai/01-tools-spec.md` — 実装済み・予定ツール一覧
- `specs/G4-ai/02-system-prompt-rules.md` — システムプロンプト設計
- `docs/07-ai-ui-policy.md` — AI と UI の役割分担
- `src/application/aiTools.ts` — AI BFF 実装
- `src/infrastructure/ai/toolRegistry.ts` — LLM プロトコルアダプター実装
