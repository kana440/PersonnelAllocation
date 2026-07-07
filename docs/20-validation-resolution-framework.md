# バリデーション・解決フレームワーク設計

`docs/05-operation-framework.md` が「操作の検出と実行」を担うのと対称的に、
本ドキュメントは **「問題の検出・分類・解決提案」** の設計思想とアーキテクチャを記述する。

---

## 概念の全体像

```
バリデータ関数群
  (assertRequired / basedOnFormat / fromFieldRules / correlation / managerChain / …)
         │
         │ emit
         ▼
  ValidationIssue[]
  { field, level, message, id?, suggestedPatch? }
         │                │
         │                └─ suggestedPatch: バリデータが「確定的な修正値」を知っているとき直接付与
         │                                  例: c('officialPositionCode', _ => ['出向者'], ...)
         │                                     → { officialPositionCode: '出向者' }
         │
    ┌────┴──────────────────────────────────────────┐
    │ resolveIssueMeta(issue)                       │ RESOLUTION_DEFS.filter(d => d.match(issue))
    ▼                                               ▼
IssueTypeMeta                              ValidationResolutionDef[]
（問題種別のメタデータ）                      （代替修正案 / 複雑な変換が必要なケース）
  chipLabel / group / defaultVisible          shortLabel / patch()
         │                                               │
         ▼                                               ▼
  フィルタUI / チップ表示                      一括修正モーダル（BulkFieldEditModal）
  （DisplayPreferenceModal）                  suggestedPatch → 推奨ワンクリック修正
                                             resolutionDefs[] → 修正方法ピッカー
```

---

## 2 層の設計思想

### なぜ 2 層か

**1 層（フラット）** の問題：
- バリデータに fix ロジックが混入し、「何が悪いか」と「どう直すか」が分離できない
- 同一問題に複数の修正戦略が存在するとき、すべてのバリデータを変更しなければならない
- 「このフィールドを修正できる方法一覧」を一箇所で把握できない

**2 層** の利点：
- Layer 1（Validator → Issue）: ドメイン事実の記述。pure function。
- Layer 2（ResolutionDef）: 修正戦略の記述。Validator と独立して変更できる。
- `suggestedPatch` により、確定的な修正はバリデータが直接付与し、ResolutionDef なしでもワンクリック修正が可能。

**InterRowRule が検査を分割しない理由（パフォーマンス）**：  
`managerChainRule` は `missing / self / circular` の 3 種の issue を 1 つのルールから出す。
これは positionCode → row の Map を 1 回構築して 3 種を検出するためで、
分割すると 30K 行規模でインデックス構築コストが 3 倍になる。
「1 バリデータ : N issueType」は InterRowRule では許容された設計である。

---

## Layer 1 — ValidationIssue（問題の事実）

```typescript
interface ValidationIssue {
  field:           keyof AllocationRow
  level:           'error' | 'warning'
  message:         string
  id?:             string                     // IssueTypeMeta.id と同一
  suggestedPatch?: Partial<AllocationRow>     // バリデータが確定的修正値を知っているとき付与
}
```

### `id` の付与ルール

- 各バリデータが直接 `id: 'required_transfer_reason'` のように付与する
- `FIELD_RULES c()` 由来は `fromFieldRules.ts` で `when` の有無により
  `'field_constraint'` または `'field_constraint_conditional'` を自動付与する

### `suggestedPatch` の付与ルール

- `evaluateFieldRule()` が `allowed.length === 1` のとき `{ [field]: allowed[0] }` を付与する
- `c('officialPositionCode', _ => ['出向者'], ...)` → valid options が 1 件 → `suggestedPatch` 確定
- `c('band', ms => ms.jobLevels.filter(...).map(e => e.label), ...)` → 複数候補 → `suggestedPatch` なし
- `assertRequired` / `basedOnFormat` / interRow 系 → 確定的な修正値なし → `suggestedPatch` なし

### IssueTypeMeta との関係

```
ValidationIssue (N) ── resolveIssueMeta() ──> IssueTypeMeta (1)   N:1
```

`resolveIssueMeta()`:
1. `issue.id` があれば Map ルックアップ（O(1)）
2. なければ `match()` フォールバック（O(N)、FIELD_RULES c() 由来は id 付与済みなので不要）

---

## Layer 2 — ValidationResolutionDef（修正案の定義）

```typescript
interface ValidationResolutionDef {
  readonly id:         string
  match(issue: ValidationIssue): boolean    // issue.id + field で判定（message パターンマッチ禁止）
  readonly shortLabel: string
  readonly field:      keyof AllocationRow
  readonly level:      'error' | 'warning'
  readonly label?:     string
  patch(row: AllocationRow, values: Partial<AllocationRow>): Partial<AllocationRow>
  // ↑ pure function。rules → commands 依存なし。呼び出し側が DirectEditOperation でラップする。
}
```

### IssueTypeMeta との関係

```
IssueTypeMeta (1) ── RESOLUTION_DEFS.filter(d => d.match(issue)) ──> ResolutionDef (N)   1:N
```

### match() の書き方

```typescript
// ✅ id + field ベース（推奨）
match(issue) {
  return issue.id === 'field_constraint_conditional' && issue.field === 'officialPositionCode'
},

// ✅ id + level ベース（genericDef 用）
match(issue) { return issue.field === 'band' && issue.level === 'warning' },

// ❌ message パターンマッチ（壊れやすい）
match(issue) { return issue.message.includes('出向先会社') },
```

### `patch()` の設計意図と `derive` との関係

`patch(row, values)` は「この解決アクション固有の追加フィールド変換」を行う pure function。

```
ユーザーが値を入力
  → patch(row, values)          ← 解決文脈に特有の追加フィールドを付与
  → DirectEditOperation(rowId, patch) で実行
  → derive が自動適用           ← 組織名・上司名など汎用的な導出は derive が担う
```

**`patch()` に書くべきもの**: derive が自動補完しない、この解決アクションの文脈に特有の追加フィールド。

```typescript
// 例: 出向者役職の修正時に、異動事由が未設定なら '出向' を同時に設定する
patch(row, values) {
  if (!row.transferReason) return { ...values, transferReason: '出向' }
  return values
}
```

**`patch()` に書かないもの**:

| 書かない理由 | 代替 |
|---|---|
| derive で自動補完されるフィールド（組織名・上司名など）| derive に任せる |
| 複数行にまたがる操作 | `EditScenario` を使う（ResolutionDef の責務外） |
| ドメイン上「この解決アクション以外でも常に連動するべき」変換 | FIELD_RULES / derive に定義する |

**現在の実装が `patch(_row, values) { return values }` のとき**: 「ユーザーが選んだ値をそのまま書き込む」という宣言であり、追加変換なしを意図している。実装の手抜きではなく、ほとんどのフィールドはこれで十分。

### フォームの初期値について

フォームの初期値は `IssueGroupDef.suggestedPatch`（= `ValidationIssue.suggestedPatch`）から取得する。
`ResolutionDef` 側に初期値提案メソッドは持たせない（関心が分離されるため）。
初期値が必要な場合はバリデータ側で `suggestedPatch` を付与する。

---

## 具体例：`officialPositionCode`（役職）

| 発生条件 | id | level | suggestedPatch |
|---|---|---|---|
| ポジションありで役職が未設定 | `required_position_attrs` | error | なし |
| 出向設定なのに役職が「出向者」でない | `field_constraint_conditional` | warning | `{ officialPositionCode: '出向者' }` |

対応する ResolutionDef：

| def.id | match条件 | 役割 |
|---|---|---|
| `officialPos-secondment` | `id === 'field_constraint_conditional' && field === 'officialPositionCode'` | 「役職(出向)」というラベルで識別 |
| `officialPos-error` | `field === 'officialPositionCode' && level === 'error'` | 汎用ドロップダウン（未設定→選択） |

### UI フロー

```
「役職(出向) 15」チップをクリック
   │
   ├─ suggestedPatch あり
   │    → [出向者に一括適用 →] ボタン表示（ワンクリック修正）
   │
   └─ resolutionDefs[0] あり
        → 修正方法ピッカー + ドロップダウン
```

---

## UI コンポーネント構成

### `buildIssueGroups()`（`UnifiedReviewView/helpers.ts`）

```typescript
{
  message:        string
  field:          string
  level:          'error' | 'warning'
  rowIds:         number[]
  suggestedPatch?: Partial<AllocationRow>     // issue から取得（確定的修正）
  resolutionDefs:  ValidationResolutionDef[]  // RESOLUTION_DEFS.filter() で全件取得
}
```

`IssueGroupDef.resolutionDefs[0]?.shortLabel` がチップの表示ラベルになる。

### `BulkFieldEditModal`

| `suggestedPatch` | `resolutionDefs.length` | UI |
|---|---|---|
| あり | 0 | 推奨ワンクリック修正セクション + 汎用ドロップダウン |
| あり | 1+ | 推奨ワンクリック修正セクション + 修正方法ピッカー |
| なし | 1 | 汎用ドロップダウン（現状と同じ） |
| なし | 2+ | 修正方法ピッカー → 選択に応じてドロップダウン |
| なし | 0 | 汎用ドロップダウン（resolutionDef なし） |

---

## ファイルマップ

| 役割 | ファイル |
|---|---|
| ValidationIssue 型（suggestedPatch 含む）| `packages/domain/src/rules/validate/types.ts` |
| suggestedPatch 付与ロジック | `packages/domain/src/rules/field.ts` `evaluateFieldRule()` |
| id 付与（FIELD_RULES 由来）| `packages/domain/src/rules/validate/fromFieldRules.ts` |
| IssueTypeMeta 定義（24種別）| `packages/domain/src/rules/validate/issueTypeMeta.ts` |
| ResolutionDef 定義カタログ | `packages/domain/src/rules/resolve/defs.ts` |
| IssueGroupDef 型 | `apps/web/src/components/review/UnifiedReviewView/types.ts` |
| buildIssueGroups() | `apps/web/src/components/review/UnifiedReviewView/helpers.ts` |
| 修正 UI | `apps/web/src/components/review/components/BulkFieldEditModal/` |
