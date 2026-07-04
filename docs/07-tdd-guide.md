# 業務操作パターンの作成・修正ガイド（TDD）

業務操作（編集パターン）を追加・修正するときの手順と、Vitest を使ったテストの書き方を説明する。

---

## 1. 登場する概念と対応コード

| 概念 | ファイル | 役割 |
|---|---|---|
| `OperationDef` | `src/domain/commands/defs/*.ts` | メニュー表示条件・フォーム定義・初期値計算の宣言 |
| `EditCommand` | `src/domain/commands/handlers/*.ts` | validate / apply の純粋関数実装 |
| `DomainContext` | `src/domain/commands/types.ts` | validate/apply に渡す読み取り専用コンテキスト |

```
ユーザーがメニューを選択
  → OperationDef.availableFor(row, cl)   ← メニュー表示判定
  → OperationDef.inputs                  ← フォームのフィールド定義
  → OperationDef.deriveInitial(row, ctx) ← フォームの初期値
  → OperationDef.createCommand(rowId, input) → EditCommand
      → EditCommand.validate(ctx) ← 操作の事前チェック
      → EditCommand.apply(ctx)    ← 状態の変更（純粋関数）
```

---

## 2. テストインフラの構成

```
tests/
  helpers/
    fixtures.ts          # AllocationRow・AllCodeLists のモックデータ
    runner.ts            # バリデーション・オプション検証用ランナー
    operationRunner.ts   # OperationDef・EditCommand 検証用ランナー
  validation/            # A〜W系バリデーションのシナリオテスト
  operations/            # 操作パターンのシナリオテスト（新規追加はここに）
  options/               # オプション絞り込みのシナリオテスト
```

### fixtures.ts の使い方

```typescript
import { makeRow, makePosRow, makePersonRow, makeCL, MOCK_ORGS } from '../helpers/fixtures'

// 最小行（transferReason だけ入っている）
const row = makeRow({ band: 'M4', employmentType: '社員' })

// ポジションつき行（A1-1 必須フィールド一式）
const posRow = makePosRow({ officialPositionCode: '部長' })

// 在席行（A1-2 必須フィールド一式）
const personRow = makePersonRow({ userId: '1234567' })

// コードリスト（必要なエントリだけ override）
const cl = makeCL({
  jobLevels: [{ code: 'M5', label: 'M5', isRegularEmployee: true, /* ... */ }],
})
```

---

## 3. OperationDef のテスト（operationRunner）

`tests/helpers/operationRunner.ts` の `runOperationScenarios()` を使う。

### 使い方の基本

```typescript
import { runOperationScenarios } from '../helpers/operationRunner'
import { promotionDef } from '../../src/domain/commands/defs/jobClassificationDefs'
import { PromotionOperation } from '../../src/domain/commands/handlers/patternOps'

runOperationScenarios('昇格操作', promotionDef, [
  // --- availableFor のテスト ---
  {
    id: 'OP-promo-1',
    desc: '社員行 → メニューに表示される',
    row: { employmentType: '社員' },
    expect: { available: true },
  },
  {
    id: 'OP-promo-2',
    desc: '出向受入行 → メニューに表示される（昇格は全雇用タイプ対象）',
    row: { employmentType: '出向受入社員' },
    expect: { available: true },
  },

  // --- validate のテスト ---
  {
    id: 'OP-promo-3',
    desc: '対象行がなければ validate 失敗',
    row: { employmentType: '社員' },
    allocationList: [],  // row を含まない空リスト
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { validateOk: false, validateErrorContains: '見つかりません' },
  },
  {
    id: 'OP-promo-4',
    desc: 'band を指定して validate 成功',
    row: { employmentType: '社員' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { validateOk: true },
  },

  // --- apply のテスト ---
  {
    id: 'OP-promo-5',
    desc: 'band が M5 に更新される',
    row: { employmentType: '社員', band: 'M4' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { applyFields: { band: 'M5' } },
  },
  {
    id: 'OP-promo-6',
    desc: 'ラベルに人名が含まれる',
    row: { employmentType: '社員', band: 'M4', lastName: '山田', firstName: '太郎' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { applyLabelContains: '山田' },
  },
])
```

### `OperationScenario` 型の全フィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | テスト識別子（例: `OP-promo-1`） |
| `desc` | string | 人が読める説明 |
| `row` | `Partial<AllocationRow>` | makeRow へのオーバーライド |
| `cl` | `Partial<AllCodeLists>` | makeCL へのオーバーライド |
| `allocationList` | `AllocationRow[]` | 省略時は `[row]` のみ |
| `orgs` | `Organization[]` | 省略時は MOCK_ORGS |
| `createCommand` | `(row, ctx) => EditCommand` | validate/apply テストに必須 |
| `expect.available` | `boolean` | `availableFor()` の期待値 |
| `expect.validateOk` | `boolean` | `validate().ok` の期待値 |
| `expect.validateErrorContains` | `string` | エラーメッセージに含まれるべき文字列 |
| `expect.applyFields` | `Partial<AllocationRow>` | apply 後に確認するフィールド |
| `expect.applyLabelContains` | `string` | undo ラベルに含まれるべき文字列 |

---

## 4. バリデーションのテスト（runner）

`tests/helpers/runner.ts` の `runScenarios()` を使う。

```typescript
import { runScenarios, strict } from '../helpers/runner'

runScenarios('F1: 出向受入のとき band は出向受入対応のものに限定', [
  {
    id: 'F1-1',
    desc: '出向受入 + 社員バンド → エラー',
    row: { employmentType: '出向受入社員', band: 'M4' },
    // FIELD_CONSTRAINTS の制約チェックは guide モードではエラーにならない。
    // strict() で明示的に strict モードにする。
    strictnessOverrides: strict('band'),
    expect: { errorFields: ['band'] },
  },
  {
    id: 'F1-2',
    desc: '出向受入タイプのとき band の選択肢は出向受入のみ',
    row: { employmentType: '出向受入社員' },
    // オプション絞り込みは strictnessOverrides 不要
    expect: {
      options: [{ field: 'band', includes: ['OM3'], excludes: ['M4'] }],
    },
  },
])
```

### `strict()` ヘルパーについて

`GLOBAL_DEFAULT_STRICTNESS = 'guide'` のため、FIELD_CONSTRAINTS の制約チェックはデフォルトでエラーを出さない（選択肢の分類のみ行う）。

エラー発生を期待するテストでは `strictnessOverrides: strict('fieldName')` を指定する。

```typescript
// 単一フィールド
strictnessOverrides: strict('band')

// 複数フィールド
strictnessOverrides: strict('band', 'payGrade', 'leaveOfAbsenceSign')
```

---

## 5. 新しい操作パターンを追加するときの手順

### Step 1: EditPattern に新ラベルを追加

```typescript
// src/domain/patterns/editPatterns.ts
export const EDIT_PATTERNS = [
  // ...
  'myNewPattern',
] as const
```

### Step 2: EditCommand を実装

```typescript
// src/domain/commands/handlers/myNewOps.ts
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'

export interface MyNewFields {
  someField?: string
}

export class MyNewOperation implements EditCommand {
  readonly kind = 'MyNew'

  constructor(
    private readonly rowId:  number,
    private readonly fields: MyNewFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.fields.someField) return fail('someField は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, someField: this.fields.someField }
          : r
      ),
      label: `新しい操作: ...`,
    }
  }
}
```

### Step 3: テストを先に書く（TDD）

```typescript
// tests/operations/myNew.test.ts
import { runOperationScenarios } from '../helpers/operationRunner'
import { myNewDef } from '../../src/domain/commands/defs/myNewDefs'
import { MyNewOperation } from '../../src/domain/commands/handlers/myNewOps'

runOperationScenarios('新しい操作', myNewDef, [
  {
    id: 'OP-mynew-1',
    desc: '対象行でメニューに表示される',
    row: { /* 条件を満たす行 */ },
    expect: { available: true },
  },
  {
    id: 'OP-mynew-2',
    desc: '非対象行でメニューに表示されない',
    row: { /* 条件を満たさない行 */ },
    expect: { available: false },
  },
  {
    id: 'OP-mynew-3',
    desc: '必須フィールドなしで validate 失敗',
    row: {},
    createCommand: (row) => new MyNewOperation(row.rowId, {}),
    expect: { validateOk: false },
  },
  {
    id: 'OP-mynew-4',
    desc: 'apply 後にフィールドが更新される',
    row: {},
    createCommand: (row) => new MyNewOperation(row.rowId, { someField: 'value' }),
    expect: { applyFields: { someField: 'value' } },
  },
])
```

### Step 4: OperationDef を実装

```typescript
// src/domain/commands/defs/myNewDefs.ts
import type { OperationDef } from '../types'
import { MyNewOperation } from '../../commands/handlers/myNewOps'

export const myNewDef: OperationDef = {
  id:         'MyNew',
  label:      '新しい操作',
  group:      'jobClassification',
  badgeColor: 'bg-blue-100 text-blue-700',

  availableFor: (row, cl) => /* 条件 */,
  inputs: [
    { field: 'someField', required: true },
  ],
  deriveInitial: (row) => ({ someField: row.someField }),
  createCommand: (rowId, input) =>
    new MyNewOperation(rowId, { someField: input.someField as string }),
}
```

### Step 5: ALL_OPERATION_DEFS に登録

```typescript
// src/domain/commands/defs/index.ts
import { myNewDef } from './defs/myNewDefs'

export const ALL_OPERATION_DEFS: OperationDef[] = [
  // ...
  myNewDef,
]
```

### Step 6: バリデーション検出条件を追加（必須）

`CLAUDE.md` の業務操作追加手順 Step 3 を参照。
Excel 後方互換のリストア保証のために必須。

---

## 6. よくあるパターンとテスト方針

### availableFor の条件が複雑な場合

`helpers.ts` の `isRegularEmployee()` / `isSecondmentAcceptance()` などを使う。
ヘルパー関数自体を直接テストするのが効果的。

```typescript
import { isRegularEmployee } from '../../src/domain/commands/defs/helpers'

test('isRegularEmployee: 社員タイプは true', () => {
  const row = makePersonRow()
  const cl  = makeCL()
  expect(isRegularEmployee(row, cl)).toBe(true)
})
```

### apply が複数行を変更する場合

`allocationList` に複数行を渡してテストする。

```typescript
{
  id: 'OP-xxx-1',
  desc: '対象行と連動行の両方が更新される',
  allocationList: [primaryRow, secondaryRow],
  createCommand: (row) => new SomeOperation(row.rowId, { ... }),
  expect: {
    applyFields: { someField: 'expectedValue' },
    // 連動行は applyFields の対象外 → 別途 apply() を呼んで確認する
  },
},
```

### deriveInitial のテスト

`deriveInitial` は `DomainContext` を受け取る純粋関数なので直接テストできる。

```typescript
test('deriveInitial: 現在の band をコピーする', () => {
  const row = makePersonRow({ band: 'M4' })
  const cl  = makeCL()
  const ctx = { allocationList: [row], afterOrganizations: MOCK_ORGS, codeLists: cl }
  const initial = promotionDef.deriveInitial(row, ctx)
  expect(initial.band).toBe('M4')
})
```
