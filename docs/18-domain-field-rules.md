# ドメインフィールドルール設計ガイド

> **対象読者**: ドメイン層（`packages/domain/src/`）を編集する開発者。
> バリデーション追加・選択肢絞り込み追加・フィールド導出変更を行うときに参照する。

---

## 1. 概念マップ

```
FIELD_RULES (fieldRules.ts)           ← 全フィールドの振る舞いを宣言する唯一の場所
  │
  ├─ value: 'auto'                     → Phase 1（導出）: source が1件なら自動セット
  ├─ options: 'filter'|'split'|'none'  → Phase 3（選択肢）: valid / invalid を決定
  └─ validation: 'error'|'warning'     → Phase 2（バリデーション）: 違反を ValidationIssue に変換

resolveRow (resolver.ts)
  Phase 1 → Phase 2 → Phase 3 の順で実行

EditOperation.constraints (commands/defs/)
  └─ action 制約（prevXxx 参照 → 操作固有方向フィルタ等）→ Phase 2 / Phase 3 に注入

Profile (fieldRules.ts)
  └─ source上書き / validation昇格 → Phase 3 / Phase 2 末尾で適用
```

---

## 2. FIELD_RULES — フィールド振る舞いの単一真実

**ファイル**: `packages/domain/src/fieldRules.ts`

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

```typescript
interface ResolveContext {
  masters:            AllMasters
  allocationList:     readonly AllocationRow[]
  afterOrganizations: readonly Organization[]
  actionConstraints?: readonly FieldRule[]   // EditOperation.constraints から注入
}
```

### 3-2. Profile（場面別上書き）

フィールドをキーとする `Partial<Record<string, ProfileEntry>>` オブジェクト。

```typescript
// stepMode = '1段階' のとき band の source を1段階分だけに絞る例
const profile: Profile = {
  band: {
    source: (ms, row) => oneStepBands(ms, row, 'up'),
  }
}
```

- `validation: 'error'` を設定すると当該フィールドの warning を error に昇格できる
- `'*'` キーで全フィールド一括昇格も可能
- `EditOperation.profile` プロパティで操作定義から渡す

---

## 4. バリデーション系統一覧

バリデーションは **3スコープ × 2評価文脈** で整理されている。

### 4-1. スコープ別分類

| スコープ | 型 | ファイル群 | 概要 |
|---|---|---|---|
| **フィールドスコープ** | `FieldRule` | `fieldRules.ts` | 1フィールド × マスタ照合（FIELD_RULES）|
| **行スコープ** | `RowRule` | `rowRules/` | 複数フィールド間の相関チェック（ROW_RULES）|
| **行間スコープ** | `InterRowRule` | `interRowRules/` | 全行を横断するチェック（INTER_ROW_RULES）|

### 4-2. 系統別詳細

| 系統 | 実装場所 | 概要 |
|---|---|---|
| **A系**（必須）| `validation/validateAssertRequired.ts` | A1-0: 申請区分必須 / A1-1〜A5: 条件付き必須 |
| **B系**（書式）| `validation/validateBasedOnFormat.ts` | 正規表現・文字種・桁数チェック |
| **C1〜C4**（相関）| `rowRules/correlation.ts` → ROW_RULES | 組織マスタ整合 / 組合フラグ / 出向組織区分 |
| **D2系**（存在）| `validation/validateFromFieldRules.ts` | D2-1: 組織コード存在 / D2-2〜11: FIELD_RULES（when なし）|
| **E1**（上司チェーン）| `interRowRules/managerChain.ts` → INTER_ROW_RULES | 上司ポジション存在・自己参照・循環 |
| **E2**（posCode重複）| `interRowRules/positionUniq.ts` → INTER_ROW_RULES | positionCode 重複（本務行のみ）|
| **F系**（条件付き存在）| `validation/validateFromFieldRules.ts` | FIELD_RULES（when あり）の評価（F1/F2/F3/F4）|
| **G1**（データ整合）| `validation/validateGlobalConsistency.ts` | 昇降格でポジション変更必須（changes 依存）|
| **W2**（昇降格警告）| `rowRules/globalConsistency.ts` → ROW_RULES | 2段階昇降格ワーニング |
| **W3**（上司組織）| フォーム: `validateGlobalConsistency.ts` / バッチ: `interRowRules/managerOrg.ts` | 上司が直系上位組織以外に所属 |

> **E系**: 旧 `validateExclusivity.ts`（O(R) per row = バッチで O(R²)）は INTER_ROW_RULES が代替（O(R)）。
> フォーム編集では `validateExclusivity.ts` が引き続き単行を処理する。

> **D2系と F系**: **同一ファイル** `validateFromFieldRules.ts` で実装。
> D2系 = `when` なしの FIELD_RULES 評価、F系 = `when` ありの評価。

### 4-3. validateRow.ts — ルーティング

```typescript
export function validateRow(ctx: RowContext): ValidationIssue[] {
  // noCheckRequired フラグが立っているとき E系のみ
  if (reasonEntry?.noCheckRequired) return runExclusivity(row, allocationList)

  const rowRuleCtx = ctx.rowRuleCtx ?? new RowRuleCtx(masters, orgs)

  const issues = [
    ...runAssertRequired(row, masters),               // A系
    ...runBasedOnFormat(row),                         // B系
    ...runFromFieldRules(row, orgs, masters),         // D2/F系
    ...(allocationList.length > 0 ? runExclusivity(row, allocationList) : []),  // E1（フォーム用）
    ...runGlobalConsistency(row, changes, allocationList, orgs),                 // G1 + W3（フォーム用）
  ]

  // ROW_RULES: C1〜C4, W2（state スコープ）
  for (const rule of ROW_RULES) {
    if (rule.scope !== 'state') continue
    if (rule.when && !rule.when(row, masters)) continue
    issues.push(...rule.validate(row, rowRuleCtx))
  }

  return issues
}
```

### 4-4. batchValidate.ts — バッチ（O(R) 設計）

```typescript
// 1インスタンスを全行で共有 → orgMasterByCode 等は1回しかビルドしない
const rowRuleCtx = new RowRuleCtx(masters, afterOrganizations)

for (const row of allocationList) {
  // allocationList:[] で E1/W3 の O(R²) 部分をスキップ
  // ROW_RULES は validateRow 内で rowRuleCtx を使って評価
  validateRow({ row, afterOrganizations, masters, allocationList: [], rowRuleCtx })
}

// INTER_ROW_RULES: E1/E2/W3 を各 O(R) で評価
for (const rule of INTER_ROW_RULES) {
  rule.validateAll(allocationList, rowRuleCtx)
}
```

---

## 5. Action 制約 (EditOperation.constraints)

**ファイル**: `packages/domain/src/commands/defs/`

State 制約（FIELD_RULES）は「常に成立すべき値の振る舞い」。
Action 制約は「この操作フォームが開いているときだけ成立すべき、操作固有の追加制約」。

典型例: 昇格フォームでバンドは「現在より上位のバンドのみ」有効

```typescript
// promotionDefs.ts — ファイル内プライベート関数
function bandDirectionConstraint(direction: 'up' | 'down', field: 'band' | 'positionBand'): FieldRule {
  return {
    field,
    value:      'none',
    options:    'split',
    validation: 'error',   // Action 制約は 'error'（フォーム開放中は厳しく）
    when:  (row) => !!(row.prevBand),
    source: (masters, row) => {
      // prevBand の level より上/下のバンドのみ返す
    },
    message: (val) => `...`,
  }
}

export const promotionDef: EditOperation = {
  constraints: [
    bandDirectionConstraint('up', 'band'),
    bandDirectionConstraint('up', 'positionBand'),
  ],
  // ...
}
```

### Action 制約 vs State 制約の使い分け

| | State 制約（FIELD_RULES） | Action 制約（constraints） |
|---|---|---|
| スコープ | 常に評価 | 操作フォーム中のみ |
| validation | `'warning'`（c() のデフォルト）| `'error'` |
| when 参照 | 現在値のみ | `prevXxx` も参照可 |
| 登録場所 | `fieldRules.ts` の `FIELD_RULES` | `EditOperation.constraints` |

---

## 6. フォルダ構成

```
packages/domain/src/
  fieldRules.ts                    ← FIELD_RULES（単一真実）・FieldRule 型・c()/s() ヘルパー
  rowRule.ts                       ← RowRule 型・RowRuleCtx（lazy getter）・ROW_RULES[]
  interRowRule.ts                  ← InterRowRule 型・defineInterRowRule・INTER_ROW_RULES[]
  resolver.ts                      ← resolveRow（3フェーズパイプライン）
  optionStrictness.ts              ← UnavailableOperationDisplay のみ（UI 設定）

  rowRules/                        ← ROW_RULES への登録（複数フィールド相関・行単位）
    index.ts                       ← ROW_RULES.push(...) 集約
    correlation.ts                 ← C1〜C4（組織マスタ整合・組合フラグ・出向組織）
    globalConsistency.ts           ← W2（2段階昇降格ワーニング）

  interRowRules/                   ← INTER_ROW_RULES への登録（全行横断）
    index.ts                       ← INTER_ROW_RULES.push(...) 集約
    managerChain.ts                ← E1（上司ポジション存在・自己参照・循環）
    positionUniq.ts                ← E2（positionCode 重複）
    managerOrg.ts                  ← W3（上司が直系上位組織以外に所属）

  validation/
    types.ts                       ← ValidationIssue・ValidationLevel 型
    validateRow.ts                 ← メイン関数・ルーティング（A/B/D2/E/F/G/ROW_RULES）
    validateAssertRequired.ts      ← A系（必須）
    validateBasedOnFormat.ts       ← B系（書式）
    validateFromFieldRules.ts      ← D2系 + F系（FIELD_RULES 評価）
    validateExclusivity.ts         ← E1（フォーム用単行・O(R) per call）
    validateGlobalConsistency.ts   ← G1（changes 依存）+ W3（フォーム用）
    batchValidate.ts               ← 全件バッチ（validateAllRows・O(R) 設計）

  commands/defs/
    types.ts                       ← EditOperation・FieldRule 使用箇所・AvailabilityResult
    promotionDefs.ts               ← 昇格・降格（bandDirectionConstraint）
    positionMoveDefs.ts            ← ポジション移動（orgTransferDef）
    ...（各操作定義）

  choices/
    index.ts                       ← getGroupedFieldOptions()（Phase 3 ベース）
    ...

  derivation/
    ...                            ← deriveFieldUpdates()（Phase 1 ベース）
```

---

## 7. よくある変更パターン

### 7-1. 新しいフィールドの値制約を追加（バリデーション + 選択肢）

```typescript
// fieldRules.ts の FIELD_RULES に追加するだけ
c('myField',
  ms => ms.myMaster.map(e => e.label),
  _ => 'myField は有効な選択肢から選択してください'),
```

→ バリデーション（D2系として `validateFromFieldRules.ts` が自動評価）と選択肢（Phase 3）が同時に有効になる。

### 7-2. 雇用タイプ条件付きの制約を追加（F系）

```typescript
c('myField',
  ms => ms.myMaster.filter(e => e.isRegularEmployee).map(e => e.label),
  _  => 'myField は正社員用の値から選択してください',
  (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee),
```

`when` を指定するだけ。F系として自動評価される。

### 7-3. W系ワーニングを追加

**単行スコープ**（複数フィールド参照、masters 参照あり）→ `rowRules/` に `RowRule` として実装し `rowRules/index.ts` に登録する。

```typescript
// rowRules/myConsistency.ts
const myWarning: RowRule = {
  id: 'WN-myCheck', scope: 'state',
  when: (row, masters) => /* 前提条件 */,
  validate(row, ctx): ValidationIssue[] {
    if (!条件) return []
    return [{ field: 'myField', level: 'warning', message: '...' }]
  },
}
export const MY_RULES: RowRule[] = [myWarning]

// rowRules/index.ts に追加
import { MY_RULES } from './myConsistency'
ROW_RULES.push(...MY_RULES)
```

**行間スコープ**（他の行を参照）→ `interRowRules/` に `InterRowRule` として実装し `interRowRules/index.ts` に登録する。

**`changes?` に依存するもの**（昇降格パターン検出など）→ `validateGlobalConsistency.ts` に残す（RowRule は changes を受け取れないため）。

### 7-4. 操作固有の方向フィルタ（Action 制約）を追加

`EditOperation.constraints` に `FieldRule` を追加する。`validation: 'error'` を使う。

```typescript
export const myDef: EditOperation = {
  constraints: [{
    field:      'myField',
    value:      'none',
    options:    'split',
    validation: 'error',
    when:       (row) => !!row.prevMyField,
    source:     (ms, row) => ms.myMaster.filter(e => e.level > currentLevel).map(e => e.label),
    message:    _ => '上位の値を選択してください',
  }],
  // ...
}
```

---

## 8. 廃止されたもの（参考）

| 廃止 | 代替 |
|---|---|
| `FieldStrictness` (`'free'|'guide'|'strict'`) | `FieldRule.validation` (`'error'|'warning'|'none'`) |
| `GLOBAL_DEFAULT_STRICTNESS` | FIELD_RULES の `validation` フィールドで各ルールが直接宣言 |
| `getFieldStrictness()` / `resolveFieldStrictness()` | FIELD_RULES + `evaluateFieldRule()` |
| `fieldConstraints.ts`（シム）| `fieldRules.ts` を直接 import |
| `rules.ts`（シム）| `fieldRules.ts` を直接 import |
| `validateDataExistence.ts`（シム）| `validateFromFieldRules.ts` |
| `validateFilteredByEmployment.ts`（シム）| `validateFromFieldRules.ts` |

`FieldStrictness` は UI プレゼンテーション型（`ComboInput` の表示制御）として `apps/web/src/components/common/ComboInput.tsx` に残存している。ドメインとは無関係。
