# ドメインフィールドルール設計ガイド

> **対象読者**: ドメイン層（`packages/domain/src/`）を編集する開発者。
> バリデーション追加・選択肢絞り込み追加・フィールド導出変更を行うときに参照する。

---

## 1. 概念マップ

```
FIELD_RULES (rules/field.ts)          ← 全フィールドの振る舞いを宣言する唯一の場所
  │
  ├─ value: 'auto'                     → Phase 1（導出）: source が1件なら自動セット
  ├─ options: 'filter'|'split'|'none'  → Phase 3（選択肢）: valid / invalid を決定
  └─ validation: 'error'|'warning'     → Phase 2（バリデーション）: 違反を ValidationIssue に変換

resolveRow (resolver.ts)
  Phase 1 → Phase 2 → Phase 3 の順で実行

EditOperation.constraints (commands/defs/)
  └─ action 制約（prevXxx 参照 → 操作固有方向フィルタ等）→ Phase 2 / Phase 3 に注入

Profile (rules/field.ts)
  └─ source上書き / validation昇格 → Phase 3 / Phase 2 末尾で適用
```

---

## 2. FIELD_RULES — フィールド振る舞いの単一真実

**ファイル**: `packages/domain/src/rules/field.ts`

### 2-1. FieldRule インターフェース

```typescript
interface FieldRule {
  field:      keyof AllocationRow
  when?:      (row: AllocationRow, masters: AllMasters) => boolean
  source:     (masters: AllMasters, row: AllocationRow) => string[]
  value:      'auto' | 'suggest' | 'none'
  options:    'filter' | 'split' | 'none'
  validation: 'error' | 'warning' | 'none'
  message?:   (val: string) => string
}
```

| 軸 | 意味 |
|---|---|
| `source()` | 有効値リストを返す。バリデーション・選択肢・自動導出の**共通基盤** |
| `when()` | このルールが適用される条件。`prevXxx` を見れば Action 制約も表現できる |
| `value` | `'auto'`: source が1件→自動セット / `'suggest'`: 候補提示のみ / `'none'`: 値セットなし |
| `options` | `'filter'`: valid のみ表示 / `'split'`: valid を上・invalid を下 / `'none'`: 選択肢不使用 |
| `validation` | `'error'`: リスト外はエラー / `'warning'`: 警告のみ / `'none'`: チェックなし |
| `message()` | validation が error/warning のとき必須 |

`FIELD_CONSTRAINTS` は `FIELD_RULES` の後方互換エイリアス（同一ファイルで `export const FIELD_CONSTRAINTS = FIELD_RULES`）。新規コードは `FIELD_RULES` を使う。

### 2-2. c() と s() コンストラクタ

```typescript
// State 制約（validation:'warning'）— セーブをブロックせず業務ルール違反を知らせる
function c(field, source, message, when?): FieldRule

// 推奨ルール（validation:'none'）— 選択肢表示のみ
function s(field, source, when?): FieldRule
```

**State 制約が 'warning' な理由**: 全フィールド固定エラーにすると業務フロー中の一時的な不整合を許容できなくなる。
Action 制約（`EditOperation.constraints`）は `validation: 'error'` を使い、操作フォームを開いている間だけ厳しく評価する。

### 2-3. 複数フィールド・複数ルール

同一フィールドに複数のルールを定義できる（雇用タイプ別の `band` / `payGrade` 絞り込みなど）。
評価は全ルールを `flatMap` — 適合するすべてのルールが評価される。

選択肢生成（`getGroupedFieldOptions`）では「条件付きルールが当たっていれば条件付きを優先、なければ一般ルール」の優先順位がある（`getEffectiveSource` 参照）。

---

## 3. resolver.ts — 3フェーズパイプライン

**ファイル**: `packages/domain/src/resolver.ts`

```
resolveRow(row, changes, ctx, profile?)
  │
  ├─ Phase 1: 収束ループ（導出）
  │   deriveFieldUpdates → FIELD_RULES value:'auto' → 変化なくなるまで繰り返し (MAX_ITER=10)
  │
  ├─ Phase 2: バリデーション
  │   validateRow() ← 全バリデーション系統（下表参照）
  │   + ctx.actionConstraints の評価
  │   + profile による warning → error 昇格
  │
  └─ Phase 3: 選択肢生成（遅延評価 = getOptions(field) を呼んだときだけ計算）
      getGroupedFieldOptions()   ← FIELD_RULES（State 制約）ベース
      → ctx.actionConstraints と交差（方向フィルタ等）
      → profile.source で最終絞り込み
```

### 3-1. ResolveContext

`{ masters, allocationList, afterOrganizations, actionConstraints? }` — `actionConstraints` は
`EditOperation.constraints` から注入される `FieldRule[]`。

### 3-2. Profile（場面別上書き）

フィールドをキーとする `Partial<Record<string, ProfileEntry>>` オブジェクト。例: `stepMode = '1段階'` のとき
`band` の `source` を1段階分だけに絞る（`profile.band.source = (ms, row) => oneStepBands(ms, row, 'up')`）。

- `validation: 'error'` を設定すると当該フィールドの warning を error に昇格できる（`'*'` キーで全フィールド一括昇格も可能）
- `EditOperation.profile` プロパティで操作定義から渡す

---

## 4. バリデーション系統一覧

バリデーションは **3スコープ × 2評価文脈** で整理されている。

### 4-1. スコープ別分類

| スコープ | 型 | ファイル群 | 概要 |
|---|---|---|---|
| **フィールドスコープ** | `FieldRule` | `rules/field.ts` | 1フィールド × マスタ照合（FIELD_RULES）|
| **行スコープ** | `RowRule` | `rules/row/` | 複数フィールド間の相関チェック（ROW_RULES）|
| **行間スコープ** | `InterRowRule` | `rules/interRow/` | 全行を横断するチェック（INTER_ROW_RULES）|

### 4-2. 系統別詳細

| 系統 | 実装場所 | 概要 |
|---|---|---|
| **A系**（必須）| `rules/validate/assertRequired.ts` | A1-0: 申請区分必須 / A1-1〜A5: 条件付き必須 |
| **B系**（書式）| `rules/validate/basedOnFormat.ts` | 正規表現・文字種・桁数チェック |
| **C1〜C4**（相関）| `rules/row/correlation.ts` → ROW_RULES | 組織マスタ整合 / 組合フラグ / 出向組織区分 |
| **D2系**（存在）| `rules/validate/fromFieldRules.ts` | D2-1: 組織コード存在 / D2-2〜11: FIELD_RULES（when なし）|
| **E1**（上司チェーン）| `rules/interRow/managerChain.ts` → INTER_ROW_RULES | 上司ポジション存在・自己参照・循環 |
| **E2**（posCode重複）| `rules/interRow/positionUniq.ts` → INTER_ROW_RULES | positionCode 重複（本務行のみ）|
| **F系**（条件付き存在）| `rules/validate/fromFieldRules.ts` | FIELD_RULES（when あり）の評価（F1/F2/F3/F4）|
| **G1**（データ整合）| `rules/validate/globalConsistency.ts` | 昇降格でポジション変更必須（changes 依存）|
| **W2**（昇降格警告）| `rules/row/consistency.ts` → ROW_RULES | 2段階昇降格ワーニング |
| **W3**（上司組織）| フォーム: `rules/validate/globalConsistency.ts` / バッチ: `rules/interRow/managerOrg.ts` | 上司が直系上位組織以外に所属 |

> **E系**: 旧 `validateExclusivity.ts`（O(R) per row = バッチで O(R²)）は INTER_ROW_RULES が代替（O(R)）。
> フォーム編集では `rules/validate/exclusivity.ts` が引き続き単行を処理する。

> **D2系と F系**: **同一ファイル** `rules/validate/fromFieldRules.ts` で実装。
> D2系 = `when` なしの FIELD_RULES 評価、F系 = `when` ありの評価。

他に `rules/validate/crossRowConsistency.ts`（同一 `groupEmployeeId` を持つ行間の整合チェック。サーバー側提出
バリデーションとフロントのレビュー表示の両方から呼ばれる）がある。

### 4-3. validateRow.ts — ルーティング

`transferReason` が `noCheckRequired` のときは E系（キー重複）のみ実行して早期リターンする。
それ以外は A系 → B系 → D2/F系（`runFromFieldRules`）→ E1（`runExclusivity`、`allocationList` があるときのみ）→
G1+W3（`runGlobalConsistency`）の順に評価し、最後に `ROW_RULES`（C1〜C4, W2）を `scope === 'state'` のもののみ
`rowRuleCtx` 付きでループ評価する。`rowRuleCtx` は呼び出し元（`batchValidate`）が渡した共有インスタンスを優先する。

### 4-4. batchValidate.ts — バッチ（O(R) 設計）

`validateAllRows()` が `rowRuleCtx` を全行で1インスタンス共有し、`allocationList: []` を渡して
`validateRow()` から E1/W3 の O(R²) 部分をスキップさせる。その後 `INTER_ROW_RULES` が E1/E2/W3 を各 O(R) で評価する。

---

## 5. Action 制約 (EditOperation.constraints)

**ファイル**: `packages/domain/src/commands/defs/`

State 制約（FIELD_RULES）は「常に成立すべき値の振る舞い」。
Action 制約は「この操作フォームが開いているときだけ成立すべき、操作固有の追加制約」。

典型例: 昇格フォームでバンドは「現在より上位のバンドのみ」有効（`promotionDefs.ts` の
`bandDirectionConstraint(direction, field)` — `prevBand` の level より上/下のバンドのみ返す `FieldRule` を返す
プライベート関数。`validation: 'error'`・`options: 'split'` で返し、`promotionDef.constraints` に積む）。

### Action 制約 vs State 制約の使い分け

| | State 制約（FIELD_RULES） | Action 制約（constraints） |
|---|---|---|
| スコープ | 常に評価 | 操作フォーム中のみ |
| validation | `'warning'`（c() のデフォルト）| `'error'` |
| when 参照 | 現在値のみ | `prevXxx` も参照可 |
| 登録場所 | `rules/field.ts` の `FIELD_RULES` | `EditOperation.constraints` |

---

## 6. フォルダ構成

```
packages/domain/src/
  resolver.ts              ← resolveRow（3フェーズパイプライン）
  optionStrictness.ts      ← UnavailableOperationDisplay のみ（UI 設定）

  rules/
    field.ts                ← FIELD_RULES（単一真実）・FieldRule 型・c()/s() ヘルパー・FIELD_CONSTRAINTS エイリアス
    rowRule.ts               ← RowRule 型・RowRuleCtx（lazy getter）・ROW_RULES[]
    interRowRule.ts          ← InterRowRule 型・defineInterRowRule・INTER_ROW_RULES[]

    row/                    ← ROW_RULES 登録: correlation.ts（C1〜C4）・consistency.ts（W2）・index.ts（集約）
    interRow/                ← INTER_ROW_RULES 登録: managerChain.ts（E1）・positionUniq.ts（E2）・
                                 managerOrg.ts（W3）・index.ts（集約）
    validate/
      validateRow.ts          ← メイン関数・ルーティング（A/B/D2/E/F/G/ROW_RULES）
      assertRequired.ts / basedOnFormat.ts / fromFieldRules.ts（D2+F系）/ exclusivity.ts（E1）/
      globalConsistency.ts（G1+W3）/ crossRowConsistency.ts / batchValidate.ts（全件バッチ）/ types.ts

    options/                 ← 選択肢生成（Phase 3）: index.ts（getGroupedFieldOptions）・orgTree.ts・
                                 rows.ts・relevantOrgs.ts
    derive/                  ← 導出（Phase 1）: index.ts・orgFields.ts・managerFields.ts・promotionFields.ts・
                                 jobFields.ts・unionFields.ts・discretionaryFields.ts

  commands/defs/
    types.ts                 ← EditOperation・FieldRule 使用箇所・AvailabilityResult
    promotionDefs.ts          ← 昇格・降格（bandDirectionConstraint）
    positionMoveDefs.ts       ← ポジション移動（orgTransferDef）
    ...（各操作定義）
```

---

## 7. よくある変更パターン

### 7-1. 新しいフィールドの値制約を追加（バリデーション + 選択肢）

```typescript
// rules/field.ts の FIELD_RULES に追加するだけ
c('myField',
  ms => ms.myMaster.map(e => e.label),
  _ => 'myField は有効な選択肢から選択してください'),
```

→ バリデーション（D2系として `fromFieldRules.ts` が自動評価）と選択肢（Phase 3）が同時に有効になる。

### 7-2. 雇用タイプ条件付きの制約を追加（F系）

```typescript
c('myField',
  ms => ms.myMaster.filter(e => e.isRegularEmployee).map(e => e.label),
  _  => 'myField は正社員用の値から選択してください',
  (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee),
```

`when` を指定するだけ。F系として自動評価される。

### 7-3. W系ワーニングを追加

**単行スコープ**（複数フィールド参照、masters 参照あり）→ `rules/row/` に `RowRule`（`id` / `scope: 'state'` /
`when` / `validate(row, ctx)` を持つオブジェクト）として実装し、配列にまとめて `rules/row/index.ts` の
`ROW_RULES.push(...)` に追加登録する。`validate()` は条件を満たさなければ `[]`、満たせば
`{ field, level: 'warning', message }` の配列を返す。

**行間スコープ**（他の行を参照）→ `rules/interRow/` に `InterRowRule` として実装し `rules/interRow/index.ts` に登録する。

**`changes?` に依存するもの**（昇降格パターン検出など）→ `rules/validate/globalConsistency.ts` に残す（RowRule は changes を受け取れないため）。

### 7-4. 操作固有の方向フィルタ（Action 制約）を追加

`EditOperation.constraints` に `FieldRule` を追加する（`validation: 'error'` を使う点が State 制約との違い）。
`when` で `prevXxx` を見て操作の対象行かを判定し、`source` で方向フィルタ済みの値リストを返す。7-1/7-2 と同じ
`FieldRule` 形をそのまま `constraints: [...]` に積むだけで、UI 側の実装は不要。

---

## 8. 廃止されたもの（参考）

| 廃止 | 代替 |
|---|---|
| `FieldStrictness` (`'free'|'guide'|'strict'`) | `FieldRule.validation` (`'error'|'warning'|'none'`) |
| `GLOBAL_DEFAULT_STRICTNESS` | FIELD_RULES の `validation` フィールドで各ルールが直接宣言 |
| `getFieldStrictness()` / `resolveFieldStrictness()` | FIELD_RULES + `evaluateFieldRule()` |
| `fieldConstraints.ts` / `rules.ts` / `validateDataExistence.ts` / `validateFilteredByEmployment.ts`（旧シムファイル） | いずれも削除済み。`rules/field.ts`・`rules/validate/fromFieldRules.ts` に統合 |

`FieldStrictness` は UI プレゼンテーション型（`ComboInput` の表示制御）として `apps/web/src/components/common/ComboInput.tsx` に残存している。ドメインとは無関係。
