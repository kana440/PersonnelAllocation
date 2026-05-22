# モジュール設計と疎結合

## モジュール一覧

各モジュールは**独立してビルド・テスト可能**になるよう設計している。
依存は矢印の向き（→ = 依存する）で示す。

```
Module A: Core Types
    ↑
Module B: Validation ─────────────────────────────┐
    ↑                                             │
Module C: Operation Abstraction (IDomainOperation) │
    ↑                                             │
Module D: Projection (派生ビュー)                  │
    ↑                                             │
Module E: Pattern Detection                       │
    ↑                                             │
Module F: Application Service ←───────────────────┘
    ↑               ↑
Module G: AI Tools  Module H: Excel Adapter
    ↑
Module I: Web UI + State (Zustand)

Module J: Code List Storage  ← Module A のみに依存
Module K: SF Adapter（将来） ← ports/ のみに依存
```

---

## Module A: Core Types

**場所**: `src/domain/allocationRow.ts`, `src/domain/schemas.ts`, `src/domain/codeLists/`, `src/domain/csvImport/`

**責務**: システム全体で使われる型・スキーマ・コードリスト・CSV 解釈ロジックを定義する

**依存**: Zod のみ（外部依存は最小）

**公開 API**:
```typescript
// allocationRow.ts
type AllocationRow     // Excel 1行の型（prev* + after フィールド）
type AfterValues       // after フィールドの部分変更型
BEFORE_AFTER_FIELD_PAIRS  // after↔prev* の対応表
function rowDiff()     // before/after の差分を返す
function nextRowId()

// schemas.ts
type Organization, Person, Position, Affiliation, Company ...（Zod 由来）

// codeLists/aggregate.ts
interface AllCodeLists  // 全コードリストの集約型
```

**テスト方法**: `rowDiff()`, `copyBeforeToAfter()` は純粋関数なので直接テスト可能

---

## Module B: Validation

**場所**: `src/domain/validation/validateRow.ts`

**責務**: `AllocationRow` 1行の整合性をチェックする。エラー・警告を返す。

**依存**: Module A のみ

**公開 API**:
```typescript
function validateRow(row, orgs, codeLists): ValidationIssue[]
function issuesForField(issues, field): ValidationIssue[]
function fieldsToShow(row, issues): Set<keyof AllocationRow>
```

**テスト方法**: 完全な純粋関数。任意の `AllocationRow` を渡して即テスト可能

```typescript
// 例
test('組織コードが存在しない場合 error', () => {
  const issues = validateRow({ ...baseRow, departmentCode: 'UNKNOWN' }, [], EMPTY_CODE_LISTS)
  expect(issues).toContainEqual({ field: 'departmentCode', level: 'error', message: expect.any(String) })
})
```

---

## Module C: Operation Abstraction

**場所**: `src/domain/operation/types.ts`, `src/domain/operation/handlers/`

**責務**: 「意味のある HR 操作」の抽象インターフェースと具体実装を提供する

**依存**: Module A + Module B

**公開 API**:
```typescript
interface IDomainOperation {
  kind: string
  validate(ctx: OperationContext): ValidationResult  // 純粋関数
  apply(ctx: OperationContext): OperationResult      // 純粋関数
}

// ユーティリティ
function ok(): ValidationOk
function fail(...messages): ValidationError
function failField(field, message): ValidationError
```

**現在の実装**:

| ハンドラー | ファイル | 説明 |
|---|---|---|
| `DirectEditOperation` | `handlers/directEdit.ts` | 1行の after フィールドを直接書き換え |

**将来追加する実装例**:
```
handlers/
├── directEdit.ts         ← 実装済み
├── moveToOrg.ts          ← 異動（複数フィールドを一括変更）
├── promote.ts            ← 昇格（band + 関連フィールド）
├── sendOnSecondment.ts   ← 出向（本務行 + 出向先行の2行操作）
├── addConcurrent.ts      ← 兼務追加
├── hire.ts               ← 採用（新行を生成）
└── createOrg.ts          ← 組織新設（organizations を変更）
```

**テスト方法**: 各ハンドラーは純粋なクラスなのでインスタンス化して直接テスト可能

```typescript
test('DirectEdit が後に validateRow エラーを出す変更を拒否する', () => {
  const op = new DirectEditOperation(1, { departmentCode: 'BAD' }, 'test')
  const result = op.validate({ allocationList: [row], afterOrganizations: [], codeLists: EMPTY_CODE_LISTS })
  expect(result.ok).toBe(false)
})

test('DirectEdit が after フィールドを更新する', () => {
  const op = new DirectEditOperation(1, { departmentCode: 'ORG_A' }, 'test')
  const result = op.apply({ allocationList: [row], afterOrganizations: orgs, codeLists: EMPTY_CODE_LISTS })
  expect(result.updatedList[0].departmentCode).toBe('ORG_A')
})
```

---

## Module D: Projection（派生ビュー）

**場所**: `src/domain/projection/rows.ts`

**責務**: `AllocationRow[]` から UI が必要とする派生ビュー（Person, Company）と組織検索 Map を生成する

**依存**: Module A のみ

**公開 API**:
```typescript
function buildOrgMap(orgs: Organization[]): Map<string, Organization>
// externalCode と id の両方をキーに登録した O(1) 検索 Map

function derivePersons(rows: AllocationRow[]): Person[]
// userId を dedupe しながら Person[] を生成

function deriveCompanies(orgs: Organization[], companies: Company[]): Company[]
```

> **注**: `deriveBeforePositions` / `deriveAfterPositions` / `deriveBeforeAffiliations` / `deriveAfterAffiliations` は廃止。
> コンポーネント側で `allocationList` + `useMemo` により `afterMembersByOrgId` / `beforeMembersByOrgId` Map を構築する。

**テスト方法**: 純粋関数。AllocationRow の配列を作って直接テスト可能

---

## Module E: Pattern Detection

**場所**: `src/domain/operationPatterns/`

**責務**: AllocationRow を見て「この人は出向パターンか / 兼務パターンか」を判定する。
AI への提案の根拠として confidence スコアを返す。

**依存**: Module A のみ

**公開 API**:
```typescript
interface IOperationPattern {
  match(rows: AllocationRow[]): PatternMatchResult   // 純粋関数
  apply(rows, values): AllocationRow[]               // 純粋関数
}

function matchAllPatterns(allocationList, patterns): Map<string, PatternDetectionResult>
```

**現状**: インターフェースのみ定義。具体的なパターン実装は未着手（Phase 2 で追加予定）

**テスト方法**: 各パターン実装は `match()` が純粋関数なので単体テスト可能

---

## Module F: Application Service

**場所**: `src/application/HRApplicationService.ts`

**責務**: 状態の Single Source of Truth。操作の実行・Undo/Redo・状態変更通知を管理する

**依存**: Module A, C, D, E

**公開 API**:
```typescript
class HRApplicationService {
  loadExcelData(data): void
  executeOperation(op: IDomainOperation): ValidationResult  // validate → checkpoint → apply
  editRow(rowId, changes): void       // checkpoint なし（プレビュー用）
  saveRow(rowId, changes): ValidationResult  // executeOperation の薄いラッパー
  addNewHireRow(opts): void
  undo(): void
  redo(): void
  reset(): void
  getSnapshot(): DomainSnapshot
  subscribe(fn): () => void
}
```

**テスト方法**: クラスのためインスタンスを生成して状態を操作できる

```typescript
test('executeOperation が validate エラー時に状態を変えない', () => {
  const svc = new HRApplicationService()
  svc.loadExcelData(mockData)
  const before = svc.getSnapshot().allocationList

  const op = new DirectEditOperation(1, { departmentCode: 'BAD' }, 'test')
  const result = svc.executeOperation(op)

  expect(result.ok).toBe(false)
  expect(svc.getSnapshot().allocationList).toEqual(before)  // 変化なし
})
```

---

## Module G: AI Tools

**場所**: `src/application/aiTools.ts`

**責務**: AI（Claude Tool Use）が呼び出せる関数群を提供する。
検索・バリデーション・操作実行の 3 種類。

**依存**: Module F（注入可能）

**公開 API**:
```typescript
// テスト時: 任意のサービスを注入
const tools = createAITools(new HRApplicationService())

// 本番時: シングルトン
import { aiTools } from './aiTools'

// 検索（副作用なし）
tools.findPersons({ name?, userId?, orgCode? })
tools.findOrgs({ name?, code?, company? })
tools.getPersonRows(userId)

// バリデーション（副作用なし）
tools.validateOperation(op)

// 変更（Undo スタックに積まれる）
tools.executeOperation(op)
tools.undo()

// ユーティリティ
tools.formatErrors(errors)
```

**テスト方法**:
```typescript
test('findPersons が名前で絞り込める', () => {
  const svc = new HRApplicationService()
  svc.loadExcelData(mockData)
  const tools = createAITools(svc)
  const results = tools.findPersons({ name: '田中' })
  expect(results.every(r => r.name.includes('田中'))).toBe(true)
})
```

---

## Module H: Excel Adapter

**場所**: `src/infrastructure/excelImport.ts`, `src/infrastructure/excelIO.ts`, `src/infrastructure/allocationListMapper.ts`

**責務**: ファイル I/O。Excel（`.xlsx` / `.xls` / `.xlsm`）の読み込みと書き出しを担う。

**依存**: Module A + xlsx ライブラリ

**公開 API**:
```typescript
type ProgressCallback = (message: string) => void

// 読み込み（全関数に onProgress? を渡すと各ステップで呼ばれる）
async function importFromFile(file: File, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult>
async function importFromUrl(url: string, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult>
async function importWorkbook(wb: WorkBook, fallbackCompanyName?: string, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult>

// 書き出し
function exportToXlsx(rows, effectiveDate, originalWorkbook?): Promise<void>
function buildExportWorkbook(rows, effectiveDate, originalWorkbook?): WorkBook
```

**インポートのスキップ条件**: `No` 列が空の行はブランク行として読み飛ばす（`userId` の有無は問わない）

**ポートとの関係**:
```
IAllocationDataSource（ports/index.ts）
    ↑ 概念的に実装（将来: 明示的に implements させる）
importFromFile / importWorkbook
```

**テスト方法**: ファイル I/O を含むためインテグレーションテスト。
単体テストが必要な場合は `importWorkbook(wb)` をモックの wb で呼ぶ。

---

## Module I: Web UI + State（Zustand）

**場所**: `src/components/`, `src/store/useStore.ts`

**責務**: UI コンポーネントとその状態管理。
`HRApplicationService` の変更通知を受けて Zustand ストアを更新する。

**依存**: Module F（HRApplicationService シングルトン）

**テスト方法**: E2E テスト（Playwright など）または React Testing Library

---

## Module J: Code List Storage

**場所**: `src/infrastructure/codeLists/`, `src/store/codeListStore.ts`

**責務**: コードリストの LocalStorage への保存と読み込み。
Excel インポート時に抽出したコードリストを次回起動時に復元する。

**依存**: Module A + `ICodeListSource`（ports/）

**テスト方法**: LocalStorage をモックして単体テスト可能

---

## Module K: SuccessFactors Adapter（将来）

**場所**: `src/adapters/salesforce/`（未実装）

**責務**: SF OData API を呼んで `AllocationData` を取得・書き戻す

**依存**: `ports/index.ts`（`IAllocationDataSource`, `IAllocationExporter`）

**追加手順**:
1. `src/adapters/salesforce/SFDataSource.ts` を作成し `IAllocationDataSource` を実装
2. `src/adapters/salesforce/SFExporter.ts` を作成し `IAllocationExporter` を実装
3. `SetupView.tsx` に SF 読み込みボタンを追加
4. `HRApplicationService.loadFromSource(source: IAllocationDataSource)` を追加

UI・ドメイン・バリデーション層はすべて変更不要。

---

## 疎結合の確認チェックリスト

新しいモジュールを追加・変更するとき、以下を確認する:

- [ ] ドメイン層（operation/, validation/, projection/, codeLists/）は外部ライブラリに依存していないか
- [ ] 操作ハンドラーの `validate()` と `apply()` は純粋関数か（副作用なし・同じ入力 → 同じ出力）
- [ ] AI と Web UI は同じ `executeOperation()` を通っているか
- [ ] 新しいデータソース（SF 等）は `IAllocationDataSource` を実装しているか
- [ ] 単体テストが外部サービスなしで書けるか
