# 開発ガイド

## Excel の列が変わったとき（メンテナンス）

| 変更対象 | 変更ファイル |
|---|---|
| 要員配置リストの列定義 | `src/domain/csvImport/allocationList/labels.ts` の `ALLOCATION_LIST_FIELDS` |
| after / prev* の対応表 | `src/domain/allocationRow.ts` の `BEFORE_AFTER_FIELD_PAIRS` |
| 組織CD一覧の列 | `src/infrastructure/excelImport.ts` の `parseOrgMaster` |
| エクスポート列 | `src/infrastructure/excelIO.ts` の `EXPORT_FIELDS` |

---

## 操作ハンドラーの追加（最重要）

新しい意味のある HR 操作（例: `MoveToOrg`「異動」）を追加する手順。

### Step 1: ハンドラーファイルを作成

`src/domain/operation/handlers/moveToOrg.ts` を作成する。

```typescript
import type { IDomainOperation, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, failField } from '../types'

// 操作が必要とするパラメータ
interface MoveToOrgParams {
  userId:         string
  toOrgCode:      string   // 異動先組織コード
  transferReason: string
  effectiveDate:  string
}

export class MoveToOrgOperation implements IDomainOperation {
  readonly kind = 'MoveToOrg'

  constructor(private readonly params: MoveToOrgParams) {}

  // 純粋関数: 現在の状態に対して操作が有効かを検証
  validate(ctx: OperationContext): ValidationResult {
    const { userId, toOrgCode } = this.params
    const rows = ctx.allocationList.filter(r => r.userId === userId)
    if (rows.length === 0) return failField('userId', `ユーザー ${userId} が見つかりません`)

    const orgExists = ctx.afterOrganizations.some(
      o => o.externalCode === toOrgCode || o.id === toOrgCode
    )
    if (!orgExists) return failField('toOrgCode', `組織コード ${toOrgCode} が見つかりません`)

    return ok()
  }

  // 純粋関数: 新しい allocationList を返す
  apply(ctx: OperationContext): OperationResult {
    const { userId, toOrgCode, transferReason } = this.params
    const updatedList = ctx.allocationList.map(row => {
      if (row.userId !== userId || row.concurrentType === '兼務') return row
      return { ...row, departmentCode: toOrgCode, transferReason }
    })
    return {
      updatedList,
      label: `異動: ${userId} → ${toOrgCode}`,
    }
  }
}
```

### Step 2: UI から呼ぶ（フォームコンポーネント内）

```typescript
import { MoveToOrgOperation } from '../domain/operation/handlers/moveToOrg'
import { useStore } from '../store/useStore'

function MoveToOrgForm({ userId, onClose }) {
  const { executeOperation } = useStore()

  const handleSubmit = (toOrgCode, transferReason) => {
    const op = new MoveToOrgOperation({ userId, toOrgCode, transferReason, effectiveDate })
    const result = executeOperation(op)
    if (!result.ok) {
      // エラー表示
      showErrors(result.errors)
      return
    }
    onClose()
  }
  // ...
}
```

### Step 3: AI から呼ぶ

`aiTools.executeOperation(op)` を使う。AI は自然言語から userId・toOrgCode を抽出して渡す。

### Step 4: テストを書く

```typescript
// src/domain/operation/handlers/moveToOrg.test.ts
import { MoveToOrgOperation } from './moveToOrg'

const ctx = {
  allocationList:     [/* テスト用 AllocationRow */],
  afterOrganizations: [{ id: 'ORG_A', externalCode: 'A001', ... }],
  codeLists:          EMPTY_CODE_LISTS,
}

test('validate: 存在しない userId は失敗', () => {
  const op = new MoveToOrgOperation({ userId: 'NONE', toOrgCode: 'A001', ... })
  expect(op.validate(ctx).ok).toBe(false)
})

test('apply: 本務行の departmentCode が更新される', () => {
  const op = new MoveToOrgOperation({ userId: 'U001', toOrgCode: 'A001', ... })
  const result = op.apply(ctx)
  const row = result.updatedList.find(r => r.userId === 'U001')
  expect(row?.departmentCode).toBe('A001')
})
```

---

## バリデーションルールの追加

`src/domain/validation/validateRow.ts` にルール関数を追加する。

### 追加例: 兼務行に兼務理由が必須

```typescript
function validateConcurrentReason(row: AllocationRow): ValidationIssue[] {
  if (row.concurrentType === '兼務' && !row.concurrentReason) {
    return [{ field: 'concurrentReason', level: 'error', message: '兼務の場合は兼務理由が必須です' }]
  }
  return []
}

// validateRow() のリストに追加
export function validateRow(row, orgs, codeLists): ValidationIssue[] {
  return [
    ...validateRequiredAfterFields(row),
    ...validateDepartmentCode(row, orgs),
    ...validateBandChangeReason(row),
    ...validateSecondmentConsistency(row),
    ...validateConcurrentReason(row),  // ← 追加
  ]
}
```

ルール関数を追加するだけで、Web UI（RowEditorPanel）と AI（validateOperation）の両方で自動的に使われる。

---

## AI Tool の追加

AI が使えるツールを追加する場合は `createAITools()` の return に関数を追加する。

### 追加例: 異動候補の提案

```typescript
// src/application/aiTools.ts 内に追加
function suggestTransferTargets(userId: string): PersonSearchResult[] {
  const rows = getPersonRows(userId)
  if (rows.length === 0) return []
  const currentBand = rows[0].band
  // 同バンドで空き組織を返す（例）
  return findPersons({}).filter(p => p.orgCode !== rows[0].departmentCode)
    .slice(0, 5)
}

// createAITools() の return に追加
return { ..., suggestTransferTargets }
```

---

## パターン実装の追加（Pattern Detection）

操作のパターン判定を追加する。AI が「この人は出向パターンっぽい」と判定するために使う。

### インターフェース

```typescript
// src/domain/operationPatterns/types.ts
interface IOperationPattern {
  match(rows: AllocationRow[]): PatternMatchResult  // 純粋関数
  apply(rows, values): AllocationRow[]               // 純粋関数
}
```

### 追加例: 出向パターン

```typescript
// src/domain/operationPatterns/secondmentPattern.ts
export const secondmentPattern: IOperationPattern = {
  id: 'secondment',
  name: '出向',
  requiredRowCount: 2,

  match(rows) {
    const hasSecondment = rows.some(r => r.employmentType === '出向')
    return {
      matched:    hasSecondment,
      confidence: hasSecondment ? 0.9 : 0.0,
      mismatches: hasSecondment ? [] : ['出向行が見つかりません'],
    }
  },

  apply(rows, values) {
    // rows の after フィールドを values で更新して返す
    return rows.map(r => ({ ...r, ...values }))
  }
}
```

### HRApplicationService に登録

```typescript
// src/infrastructure/container.ts（または main.tsx）
appService.registerPatterns([secondmentPattern, ...])
```

---

## SuccessFactors アダプターの追加（将来）

### Step 1: データソースを実装

```typescript
// src/adapters/salesforce/SFDataSource.ts
import type { IAllocationDataSource, AllocationData } from '../../ports'

export class SFDataSource implements IAllocationDataSource {
  constructor(private readonly apiClient: SFApiClient) {}

  async load(): Promise<AllocationData> {
    const [employees, orgs, codeLists] = await Promise.all([
      this.apiClient.getEmployees(),
      this.apiClient.getOrganizations(),
      this.apiClient.getPicklists(),
    ])
    return {
      allocationList:      toAllocationRows(employees),
      beforeOrganizations: toOrganizations(orgs),
      afterOrganizations:  toOrganizations(orgs),
      companies:           toCompanies(orgs),
      codeLists:           toCodeLists(codeLists),
    }
  }
}
```

### Step 2: HRApplicationService に loadFromSource を追加

```typescript
// src/application/HRApplicationService.ts に追加
async loadFromSource(source: IAllocationDataSource): Promise<void> {
  const data = await source.load()
  this.loadExcelData(data)  // 内部形式は同じ
}
```

### Step 3: SetupView.tsx に選択肢を追加

Excel 読み込みと SF 読み込みを選べる UI を追加するだけ。
ドメイン層・バリデーション・AI Tools は変更不要。

---

## よくある質問

### Q: 新しい操作は Registry に登録が必要？

不要。`IDomainOperation` を実装したクラスをインスタンス化して
`executeOperation(op)` に渡すだけ。

### Q: Undo はどう動く？

`executeOperation()` が `checkpoint()` を呼んでからから `apply()` する。
`undo()` は `past.pop()` で前の `CoreState` に戻すだけ。
ハンドラー側で特別な実装は不要。

### Q: AI と Web UI でバリデーションが違う動きをしないか？

同じ `executeOperation()` を通るので同一。
`validate()` は同じコードが呼ばれる。

### Q: エラーが出たとき状態はどうなる？

`validate()` が失敗した場合、`checkpoint()` も `apply()` も呼ばれない。
状態は変化しない。

### Q: テストで Zustand や React が必要？

ドメイン層（Module A〜E）と AI Tools（Module G）のテストは
Zustand も React も不要。Node.js で純粋に動く。
