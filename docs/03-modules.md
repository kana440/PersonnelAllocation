# モジュール設計と疎結合

## モジュール一覧

各モジュールは**独立してビルド・テスト可能**になるよう設計している。
依存は矢印の向き（→ = 依存する）で示す。

```
Module A: Core Types
    ↑
Module B: Validation ─────────────────────────────┐
    ↑                                             │
Module C: Operation Abstraction (EditCommand) │
    ↑                                             │
Module D: Projection (派生ビュー)                  │
    ↑                                             │
Module F: Application Service ←───────────────────┘
    ↑               ↑
Module G: AI Tools  Module H: Excel Adapter
    ↑
Module I: Web UI + State (Zustand)

Module J: Code List Storage  ← Module A のみに依存
Module K: SF Adapter（将来） ← ports/ のみに依存
```

> **注**: Module E（Pattern Detection）はインターフェースのみ定義・実装ゼロ。
> AI Tool Use が代替できるか判断後に存続/削除を決定する。

---

## Module A: Core Types

**場所**: `src/domain/allocationRow.ts`, `src/domain/schemas.ts`, `src/domain/codeLists/`, `src/domain/csvImport/`

**責務**: システム全体で使われる型・スキーマ・コードリスト・CSV 解釈ロジックを定義する

**依存**: Zod のみ（外部依存は最小）

**公開 API**:
```typescript
// allocationRow.ts
type AllocationRow         // Excel 1行の型（prev* + after フィールド）
type AfterValues           // after フィールドの部分変更型
type FieldBinding          // 'position' | 'person' | 'both' | 'allocation' | 'meta'
FIELD_METADATA             // 全フィールドの after/before/binding 定義（正規ソース）
BEFORE_AFTER_FIELD_PAIRS   // FIELD_METADATA から導出（後方互換）
fieldsByBinding(b)         // binding でフィルタした FieldMeta[]
afterKeysByBinding(b)      // binding の after キー一覧
function rowDiff()         // before/after の差分を返す
function nextRowId()
function copyBeforeToAfter()

// schemas.ts
type Organization, Person, Company ...（Zod 由来）
```

**テスト方法**: `rowDiff()`, `copyBeforeToAfter()`, `fieldsByBinding()` は純粋関数なので直接テスト可能

---

## Module B: Validation

**場所**: `src/domain/validation/`（複数ファイルに分割）, `src/domain/choices/`

**責務**: `AllocationRow` 1行の整合性をチェックする。エラー・警告を返す。
また、`FIELD_CONSTRAINTS` を単一ソースとしてバリデーション（存在チェック）と UI 選択肢絞り込みの両方を導出する。

**依存**: Module A のみ

**ファイル構成**:

| ファイル | 役割 |
|---|---|
| `validateRow.ts` | オーケストレーター（各 validate* を呼び出して結果を集約） |
| `types.ts` | `ValidationIssue` / `ValidationLevel` 型定義 |
| `validateAssertRequired.ts` | A 系（必須項目チェック） |
| `validateBasedOnFormat.ts` | B 系（形式チェック） |
| `validateCorrelation.ts` | C 系（関連・整合性）: C1 組織階層 / C2 勤務地・コストセンター / C3 非組合協定 / C4 出向 |
| `validateDataExistence.ts` | D 系（コードリスト存在チェック）: `FIELD_CONSTRAINTS` から導出 |
| `validateExclusivity.ts` | E 系（キー重複チェック） |
| `validateGlobalConsistency.ts` | G 系（整合性エラー）+ W 系（ワーニング）: G1 昇降格時ポジション未変更 / W2 2段階昇降格 |
| `fieldConstraints.ts` | `FIELD_CONSTRAINTS` 配列 — 許容値制約の単一定義ソース。`SuggestionRule \| ConstraintRule` の discriminated union。`validateDataExistence.ts`・`validateCorrelation.ts`（F1-F4）・`choices/` の 3 箇所が参照する |
| `choices/index.ts` | `buildBaseOptions()` / `filterOptions()` / `getFieldOptions()` — UI の選択肢生成・行状態による絞り込み |

**公開 API**:
```typescript
// validateRow.ts
function validateRow(ctx: RowContext, overrides?): ValidationIssue[]
function issuesForField(issues, field): ValidationIssue[]
function fieldsToShow(row, issues): Set<keyof AllocationRow>

// choices/index.ts
function buildBaseOptions(field, codeLists): OptionItem[]
function filterOptions(field, row, base, codeLists): OptionItem[]
function getFieldOptions(field, row, codeLists, currentJobFamily?): OptionItem[]
```

**テスト方法**: 完全な純粋関数。任意の `AllocationRow` を渡して即テスト可能

---

## Module C: Operation Abstraction

**場所**: `src/domain/commands/`, `src/domain/patterns/`

**責務**: 業務操作の抽象インターフェース・分類ラベル・複合操作を提供する

**依存**: Module A + Module B

**設計思想**: `docs/05-operation-framework.md` を参照

**公開 API**:
```typescript
// EditCommand — 単行の原子操作
interface EditCommand {
  kind: string
  validate(ctx: DomainContext): ValidationResult  // 純粋関数
  apply(ctx: DomainContext): OperationResult      // 純粋関数
}

// EditScenario — 複合操作（玉突き人事等）
interface EditScenario {
  label: string
  commands: EditCommand[]
}

// EditPattern — 分類ラベル（表示・集計・メニュー用）
type EditPattern = 'orgTransfer' | 'promotionDemotion' | 'resignation' | ...

function ok(): ValidationOk
function fail(...messages): ValidationError
function failField(field, message): ValidationError
```

**主なハンドラー**:

| ハンドラー | ファイル | EditPattern |
|---|---|---|
| `DirectEditOperation` | `handlers/directEdit.ts` | — |
| `PromotionOperation` | `handlers/patternOps.ts` | `promotionDemotion` |
| `OrgTransferOperation` | `handlers/patternOps.ts` | `orgTransfer` |
| `ResignationOperation` | `handlers/patternOps.ts` | `resignation` |
| `VacantPositionMoveOperation` | `handlers/patternOps.ts` | `vacantPositionMove` |
| `SecondmentReleaseOperation` | `handlers/patternOps.ts` | `secondmentRelease` |

---

## Module D: Projection（派生ビュー）

**場所**: `src/domain/choices/rows.ts`

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
> ポジションツリーはコンポーネント側の `positionTreeByOrgId` useMemo（O(n)）で構築する。

**テスト方法**: 純粋関数。AllocationRow の配列を作って直接テスト可能

---

## Module F: Application Service

**場所**: `src/application/HRApplicationService.ts`

**責務**: 状態の Single Source of Truth。操作の実行・Undo/Redo・状態変更通知を管理する

**依存**: Module A, C, D

**公開 API**:
```typescript
class HRApplicationService {
  // データ読み込み
  loadExcelData(data): void
  mergeExcelData(data): MergeResult

  // 操作の実行（Undo 対象）
  executeScenario(s: EditScenario): ValidationResult   // 統一エントリポイント
  executeOperation(op: EditCommand): ValidationResult  // 後方互換ラッパー
  editRow(rowId, changes): void       // checkpoint なし（プレビュー用）
  saveRow(rowId, changes): ValidationResult
  addNewHireRow(opts): void

  // ポジション操作（executeOperation 経由・Undo 対象）
  createVacantPosition(departmentCode: string, localJobTitle: string): void
  removePosition(rowId: number): void
  assignPersonToVacantPosition(vacantRowId: number, personSfId: string): void
  unassignPersonFromPosition(rowId: number): void

  // Undo/Redo
  undo(): void
  redo(): void
  reset(): void

  // 状態取得・通知
  getSnapshot(): DomainSnapshot
  subscribe(fn): () => void
}
```

**テスト方法**: クラスのためインスタンスを生成して状態を操作できる

---

## Module G: AI Tools

**場所**: `src/application/aiTools.ts`

**責務**: AI（Claude Tool Use / シナリオハンドラー）が呼び出せる関数群を提供する。
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
tools.getRow(rowId)
tools.getOrgs()
tools.getPersons()

// バリデーション（副作用なし）
tools.validateOperation(op)

// 変更（Undo スタックに積まれる）
tools.executeOperation(op)
tools.undo()

// ユーティリティ
tools.formatErrors(errors)
```

**現在の欠陥（AI-Position 対応ギャップ）**:
- `findPositions()` / `findVacantPositions()` がない → AI は空席を検索できない
- `createVacantPosition` / `assignPersonToVacantPosition` / `unassignPersonFromPosition` / `removePosition` が未公開
- → AI はポジション操作を実行できない（[next-steps](./06-next-steps.md) Step 1）

---

## Module H: Excel Adapter

**場所**: `src/infrastructure/excel/exceljs/exporter.ts`, `src/infrastructure/excel/xlsx/exporter.ts`,
`src/infrastructure/excel/engine.ts`, `src/infrastructure/allocationListMapper.ts`

**責務**: ファイル I/O。Excel（`.xlsx` / `.xlsm`）の読み込みと書き出しを担う。

**依存**: Module A + xlsx / ExcelJS ライブラリ

**エクスポート時の positionCode 判定**:
```typescript
// 内部採番 ID（_pos_ プレフィックス）→ blank 出力
// Excel 由来またはユーザー入力あり → そのまま出力
function exportValue(row, key): unknown {
  if (key === 'positionCode') {
    const s = row.positionCode ?? ''
    return s.startsWith('_pos_') ? undefined : row.positionCode
  }
  return row[key]
}
```

**テスト方法**: ファイル I/O を含むためインテグレーションテスト。

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

**依存**: Module A + `ICodeListSource`（ports/）

---

## 疎結合の確認チェックリスト

新しいモジュールを追加・変更するとき、以下を確認する:

- [ ] ドメイン層（commands/, validation/, choices/, masters/）は外部ライブラリに依存していないか
- [ ] 操作ハンドラーの `validate()` と `apply()` は純粋関数か（副作用なし・同じ入力 → 同じ出力）
- [ ] AI と Web UI は同じ `executeOperation()` を通っているか（またはその計画があるか）
- [ ] AI から呼ぶ操作は `aiTools` に公開されているか
- [ ] 新しいデータソース（SF 等）は `IAllocationDataSource` を実装しているか
- [ ] 単体テストが外部サービスなしで書けるか
