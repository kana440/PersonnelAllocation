# データフロー・データ設計書

## アーキテクチャ概要

```
Excel ファイル
    │
    ▼
[インポート層]   src/infrastructure/excelImport.ts
    │              AllocationRow[] + OperationGroup[]（自動推定）を生成
    ▼
[ドメイン層]    src/domain/
    │              allocationRow.ts         ← 行の型・before→after コピー
    │              operationGroups/         ← 操作ハンドラー群（kind ごと）
    │                apply.ts              ← 純粋関数: rows + groups → computedRows
    │                parse.ts              ← Excel diff → OperationGroup[] 自動推定
    ▼
[アプリケーション層]  src/application/HRApplicationService.ts
    │              Single Source of Truth の管理者
    ▼
[ストア層]      src/store/useStore.ts       ← Zustand（UI との橋渡し）
    ├──────────────────────────────────────────────────────────────────
    ▼                                       ▼
[WebUI 操作]                             [AI 操作]
 components/forms/ の各フォーム          AIChatDrawer → AI エージェント
 ↓ addOperation / addOperationGroup      ↓ addOperationGroup（同一 API）
    └──────────────────────────────────────────────────────────────────
                            │
                            ▼ HRApplicationService.addOperationGroup()
                    operationGroups に追加
                    applyOperationGroups() で再計算
                            │
                            ▼
[エクスポート層] src/utils/excelIO.ts       ← computedRows → Excel
    │
    ▼
Excel ファイル（要員配置リストシートを置換）
```

**設計の核心**: WebUI からの編集も AI からの操作も **必ず同一の `addOperationGroup()` を通る**。
検証・計算ロジックはドメイン層のハンドラーに一元化されており、UI 側に業務ロジックは置かない。

---

## 1. 単一データソース（Single Source of Truth）

`HRApplicationService` が保持する真の状態は 5 つだけ。

```
allocationList:  AllocationRow[]    ← Excel の before 列（不変）
operationGroups: OperationGroup[]   ← 操作履歴（Undo/Redo の単位）
organizations:   Organization[]     ← 組織マスタ（操作で変化しうる）
companies:       Company[]          ← 会社マスタ
codeLists:       AllCodeLists       ← 各種コードリスト
```

その他の状態（`computedRows`, `persons`, `beforePositions`, `afterAffiliations` 等）は
すべて `getSnapshot()` 内で毎回計算される**派生ビュー**であり、保存されない。

### AllocationRow の構造

```
AllocationRow = AllocationList（Excelの全列） + { rowId, operationGroupId? }

┌──────────────────────────────────────────────┐
│  before 列（prev*）    ← Excel 原本。不変     │
│  prevDepartmentCode                           │
│  prevBand                                     │
│  prevEmploymentType ... 等                    │
├──────────────────────────────────────────────┤
│  after 列              ← 計算結果で上書き     │
│  departmentCode                               │
│  band                                         │
│  employmentType ... 等                        │
├──────────────────────────────────────────────┤
│  メタ列                                       │
│  rowId（Excel 行番号と対応）                  │
│  operationGroupId（どの操作に属するか）       │
└──────────────────────────────────────────────┘
```

`applyOperationGroups()` は:
1. after 列 ← before 列のコピーで初期化（"変更なし"がデフォルト）
2. `operationGroups` を `order` 順に適用して after 列を上書き

Undo は「対象グループを除いて `applyOperationGroups()` を再実行」するだけ。

---

## 2. インポート（Excel → ドメイン）

### ファイル: `src/infrastructure/excelImport.ts`

```
importFromFile(file) / importFromUrl(url)
  │
  ├── [1] 各種TBL シート → parseCodeListsFromWorkbook() → AllCodeLists
  ├── [2] 組織CD一覧 シート → parseOrgMaster() → orgMasterToEntities()
  │         → { organizations, companies }
  └── [3] 要員配置リスト シート → parseAllocationSheet()
            → AllocationList[]（before/after 両列を保持）
            → rowId = 行番号（1始まり）を付与 → AllocationRow[]
            → parseOperationGroups(rows, effectiveDate)
                  → OperationGroup[]（before/after 差分から自動推定）
```

### `parseOperationGroups`（`src/domain/operationGroups/parse.ts`）

Excel の before/after 差分を見て、以下の順で kind を自動判定する。
判定できない行は `RawDiff` として Excelの after 値をそのまま保持（エラーにしない）。

| パス | 対象 | 判定条件 |
|---|---|---|
| Pass 1 | `SendOnSecondment` | 同一 userId の 2 行：1 行目は employmentType='出向' に変化、2 行目は prevDeptCode 空で afterDeptCode あり |
| Pass 2 | `RecallFromSecondment` | 同一 userId の 2 行：1 行目は prevEmploymentType='出向' から戻り、2 行目は出向先行 |
| Pass 3 | `Hire` | prevDeptCode 空・prevPositionCode 空・afterDeptCode あり |
| Pass 3 | `AddConcurrent` | prevConcurrentType≠'兼務' → afterConcurrentType='兼務' |
| Pass 3 | `RemoveConcurrent` | prevConcurrentType='兼務' → afterConcurrentType 空 |
| Pass 3 | `MoveToOrg` | deptCode が変化、band は変化なし |
| Pass 3 | `Promote` | band が変化 |
| Pass 3 | `RawDiff` | 上記に該当しない差分あり行（Excelの after 値を確定値として afterValues に保存） |

---

## 3. 操作グループ（OperationGroup）の設計

### OperationGroup 型

```typescript
interface OperationGroup {
  id:            string            // 一意ID
  kind:          OperationGroupKind
  label:         string            // UI 表示用
  rowIds:        number[]          // 対象 allocationList 行（複数可）
  order:         number            // 適用順（Undo/Redo の基準）
  effectiveDate: string            // 発令日
  params:        Record<string, string>  // ハンドラーが使う入力値
  afterValues?:  AfterValues       // RawDiff のみ：Excelの after 値を直接保持
}
```

### kind 一覧とハンドラー

| kind | ハンドラーファイル | rowIds の扱い | Web フォーム |
|---|---|---|---|
| `MoveToOrg` | `handlers/moveToOrg.ts` | 1 行（本務行） | `MoveToOrgForm` |
| `Promote` | `handlers/promote.ts` | 1 行 | `PromoteForm` |
| `AddConcurrent` | `handlers/addConcurrent.ts` | 0 行（新行を生成） | `AddConcurrentForm` |
| `RemoveConcurrent` | `handlers/removeConcurrent.ts` | 1 行（兼務行） | `RemoveConcurrentForm` |
| `SendOnSecondment` | `handlers/sendOnSecondment.ts` | 2 行（本務＋出向先） | `SendOnSecondmentForm` |
| `RecallFromSecondment` | `handlers/recallFromSecondment.ts` | 1〜2 行 | `RecallFromSecondmentForm` |
| `Hire` | `handlers/hire.ts` | 0 行（新行を生成） | — (`addNewHire` 経由) |
| `Retire` | `handlers/retire.ts` | 1 行 | — |
| `CreateOrg` | `handlers/createOrg.ts` | 0 行（organizations を変更） | — |
| `AbolishOrg` | `handlers/abolishOrg.ts` | 0 行（organizations を変更） | — |
| `RawDiff` | `handlers/rawDiff.ts` | N 行 | — （自動生成のみ） |
| `CreateVacantPosition`、`FillVacantPosition`、`SetManager`、`ChangeSecondment` | なし（RawDiff と同様に動作） | — | `SearchPersonPanel` 内フォーム |

### OperationGroupHandler インターフェース

```typescript
interface OperationGroupHandler {
  kind: OperationGroupKind

  // 操作適用（純粋関数: ctx を受け取り新しい ctx を返す）
  apply(ctx: OperationContext, group: OperationGroup): OperationContext

  // 追加前バリデーション・重複排除（省略可）
  // null    → 対になる既存グループを削除して新規追加しない（相殺）
  // []以上  → フィルタ済みリストを返し、その後ろに新規追加
  preAdd?(groups: OperationGroup[], newGroup: Omit<OperationGroup, 'id'|'order'>): OperationGroup[] | null
}
```

`preAdd` の使い道：
- `MoveToOrg`: 同一人物の既存 MoveToOrg を取り消して上書き
- `AddConcurrent`/`RemoveConcurrent`: ペアを相殺（追加→削除で null を返す）

---

## 4. Web UI の編集フロー

### 操作の起点

ユーザーが人物を選択 → `PersonDetailPanel` が表示 → アクションボタンで対応フォームを開く。

```
左ツリー（OverviewPanel）
  → 組織クリック → focusOrg → OrgOperationView
      → 人物ドラッグ&ドロップ → addOperation('MoveToOrg')
      → 人物クリック → selectPerson → PersonDetailPanel
          → アクションボタン（分掌異動/出向/兼務追加…）
              → forms/ 内のフォームコンポーネント
                  → onSubmit(FormSubmitPayload) → addOperation()
```

### フォームコンポーネントの構成

```
src/components/forms/
├── types.ts                    ← 共通型定義
│     FormSubmitPayload         ← フォームが返す値（kind, label, params, transferReason…）
│     BaseFormProps             ← 全フォームが受け取るプロパティ（person, orgs, bands…）
├── parts.tsx                   ← 共通 UI パーツ（OrgSelect, BandSelector, MetaSection…）
├── MoveToOrgForm.tsx
├── PromoteForm.tsx
├── SendOnSecondmentForm.tsx
├── RecallFromSecondmentForm.tsx
├── AddConcurrentForm.tsx
└── RemoveConcurrentForm.tsx
```

### バリデーション・保存の責務分担

| 層 | 責務 | 実装箇所 |
|---|---|---|
| **フォーム（UI）** | 入力の UI バリデーション（必須項目チェック、選択肢の制限） | 各フォームの `disabled` 条件 と `handleSubmit` 内ガード |
| **`preAdd`（ドメイン）** | 業務ルールの相殺・重複排除 | `handlers/*.ts` の `preAdd` メソッド |
| **`apply`（ドメイン）** | after 列への反映ロジック | `handlers/*.ts` の `apply` メソッド |
| **保存（永続化）** | ブラウザセッション内は `HRApplicationService` のメモリのみ。Excel への保存は明示エクスポート時のみ | `excelIO.ts` の `exportToXlsx` / `buildExportWorkbook` |

> **バリデーションに Zod は使っていない**。UI の `disabled` 制御と `preAdd` の業務ルールで十分なため。
> フォームが `onSubmit(payload)` を呼ぶと、その後のロジックはすべてドメイン層に移譲する。

### フォーム → ドメインへの接続

```
PersonDetailPanel.handleSubmit(payload: FormSubmitPayload)
  └── addOperation({ ...payload, effectiveDate })   ← useStore のアクション
        └── appService.addOperation(op)
              ├── params.personId から userId を抽出（旧 'p_xxx' 形式対応）
              ├── allocationList から rowIds を逆引き
              └── addOperationGroup({ kind, label, rowIds, effectiveDate, params, afterValues? })
                    ├── handler.preAdd() でバリデーション・相殺
                    └── operationGroups に追加 → emit() → Zustand 再同期
```

---

## 5. AI が利用する操作 API（Web と共通）

AI エージェント（`AIChatDrawer` → AI バックエンド）も `addOperationGroup()` を直接呼ぶ。
Web フォームとまったく同一のコードパスを経由するため、
**業務ルールの実装は一箇所に集中**しており、AI/Web で動作の差異は生まれない。

```typescript
// AI が出す命令の例（Web フォームの FormSubmitPayload と同形式）
store.addOperationGroup({
  kind:          'MoveToOrg',
  label:         '分掌異動：田中 太郎',
  rowIds:        [12],          // allocationList 上の行番号
  effectiveDate: '2025-04-01',
  params: {
    userId:        'U001234',
    toOrgId:       'ORG_SALES_A',
    companyId:     'COMPANY_A',
    transferReason: '要員計画',
  },
})
// → MoveToOrgHandler.preAdd() → apply() → computedRows 更新
```

AI が利用するインターフェースは以下の 3 つのみ:

| API | 用途 |
|---|---|
| `store.addOperationGroup(group)` | 操作を追加 |
| `store.removeOperationGroup(id)` | 操作を削除（Undo） |
| `store.getSnapshot()` (= `useStore.getState()`) | 現在の状態を読む |

---

## 6. エクスポート（ドメイン → Excel）

### `toAllocationRows`（`src/utils/allocationListMapper.ts`）

```
applyOperationGroups() で計算済みの computedRows
  ├── 各行に _meta（operationType, companyName, hasSF…）を付与
  └── UI 表示用 AllocationRow[] を返す
```

### `buildExportWorkbook` / `exportToXlsx`（`src/utils/excelIO.ts`）

```
exportToXlsx(rows, effectiveDate, originalWorkbook?, originalFileName?)
  └── buildExportWorkbook()
        ├── 元シートがある場合
        │     → 要員配置リストシートのデータ行のみ上書き
        │        （他シート・マクロ・タイトル行はそのまま保持）
        └── ない場合 → 新規ワークブックを作成
```

### 「保存してクリア」フロー（`ClearSessionDialog`）

```
buildExportWorkbook() でワークブック組み立て
  → showSaveFilePicker()（File System Access API）でユーザーが保存先を選択
      → XLSX.write() で ArrayBuffer → FileSystemWritableFileStream に書き込み
      → 成功したら reset() + sessionReady = false
      → AbortError（キャンセル）は何もしない
  ※ 非対応ブラウザ → XLSX.writeFile() でダウンロード
```

---

## 7. 新しい操作種別を追加するとき

新しい `kind`（例: `TransferWithPromotion`）を追加する手順。

### Step 1: ドメイン型に追加

```typescript
// src/domain/operationGroups/types.ts
export const OPERATION_GROUP_KINDS = [
  ...
  'TransferWithPromotion',   // ← 追加
] as const
```

### Step 2: ハンドラーを実装

```typescript
// src/domain/operationGroups/handlers/transferWithPromotion.ts
import type { OperationGroupHandler } from '../handler'

export const transferWithPromotionHandler: OperationGroupHandler = {
  kind: 'TransferWithPromotion',

  apply(ctx, group) {
    // params から必要な値を取り出し、ctx.rows の after 列を書き換えて返す
    const { userId, toOrgId, band } = group.params
    const rows = ctx.rows.map(row => {
      if (row.userId !== userId) return row
      return { ...row, departmentCode: toOrgId, band, operationGroupId: group.id }
    })
    return { ...ctx, rows }
  },

  preAdd(groups, newGroup) {
    // 同一人物の既存 TransferWithPromotion を取り消す例
    return groups.filter(g =>
      !(g.kind === 'TransferWithPromotion' && g.params.userId === newGroup.params.userId)
    )
  },
}
```

### Step 3: レジストリに登録

```typescript
// src/domain/operationGroups/registry.ts
import { transferWithPromotionHandler } from './handlers/transferWithPromotion'

export const operationGroupRegistry = new Map<OperationGroupKind, OperationGroupHandler>([
  ...
  ['TransferWithPromotion', transferWithPromotionHandler],
])
```

### Step 4: Web フォームを追加（UI が必要な場合）

```typescript
// src/components/forms/TransferWithPromotionForm.tsx
export function TransferWithPromotionForm({ person, ... , onSubmit, onCancel }: BaseFormProps) {
  // ...UI 実装...
  const handleSubmit = () => {
    onSubmit({
      kind:   'TransferWithPromotion',
      label:  `異動昇格: ${person.name}`,
      params: { personId: person.id, toOrgId, band, companyId },
    })
  }
  return <form>...</form>
}
```

```typescript
// src/components/PersonDetailPanel.tsx
// ACTIONS 配列に追加すると、アクションボタンが自動で現れる
const ACTIONS = [
  ...
  { kind: 'TransferWithPromotion', label: '異動昇格', ... },
]
// activeAction のスイッチに追加
case 'TransferWithPromotion': return <TransferWithPromotionForm {...formProps} />
```

### Step 5: OP_LABELS / OP_COLORS / OPERATION_LABELS に追加

```typescript
// PersonDetailPanel.tsx の OP_LABELS
// OperationPanel.tsx の OPERATION_LABELS
'TransferWithPromotion': '異動昇格',
```

### Step 6（任意）: `parseOperationGroups` に自動推定ロジックを追加

Excel インポート時に自動で `TransferWithPromotion` として分類したい場合は
`src/domain/operationGroups/parse.ts` の Pass 3 に判定条件を追加する。

---

## 8. ファイルマップ

```
src/
├── infrastructure/
│   ├── excelImport.ts              ← インポーター（3シート対応）
│   │                                  ImportedWorkbookResult を返す
│   └── codeLists/
│       ├── excelParser.ts
│       └── localStorageRepository.ts
├── utils/
│   ├── excelIO.ts                  ← buildExportWorkbook / exportToXlsx / parseXlsx
│   └── allocationListMapper.ts     ← computedRows + orgs → AllocationRow（_meta付）
├── domain/
│   ├── allocationRow.ts            ← AllocationRow 型・BEFORE_AFTER_FIELD_PAIRS・copyBeforeToAfter
│   ├── operationGroups/
│   │   ├── types.ts                ← OperationGroup・OperationGroupKind・AfterValues
│   │   ├── handler.ts              ← OperationGroupHandler インターフェース・OperationContext
│   │   ├── registry.ts             ← kind → handler のマップ
│   │   ├── apply.ts                ← applyOperationGroups()（純粋関数）
│   │   ├── parse.ts                ← parseOperationGroups()（Excel diff → groups 自動推定）
│   │   ├── snapshot.ts             ← derivePersons / derivePositions 等（後方互換ビュー）
│   │   └── handlers/
│   │       ├── moveToOrg.ts
│   │       ├── promote.ts
│   │       ├── addConcurrent.ts
│   │       ├── removeConcurrent.ts
│   │       ├── sendOnSecondment.ts
│   │       ├── recallFromSecondment.ts
│   │       ├── hire.ts
│   │       ├── retire.ts
│   │       ├── createOrg.ts
│   │       ├── abolishOrg.ts
│   │       └── rawDiff.ts
│   ├── codeLists/
│   │   ├── orgMaster.ts
│   │   └── aggregate.ts
│   └── csvImport/allocationList/
│       ├── labels.ts               ← ALLOCATION_LIST_FIELDS（列定義の中心）
│       └── schema.ts               ← AllocationList Zod スキーマ
├── application/
│   └── HRApplicationService.ts    ← 単一 Source of Truth・addOperationGroup・getSnapshot
├── store/
│   └── useStore.ts                 ← Zustand（AppState = DomainSnapshot + UIState + Actions）
└── components/
    ├── MasterSetup.tsx             ← インポート画面
    ├── OverviewPanel.tsx           ← 組織ツリー（左パネル）
    ├── OrgOperationView.tsx        ← 組織図キャンバス（D&D 異動）
    ├── BeforeOrgCanvas.tsx         ← 発令前組織図
    ├── PersonDetailPanel.tsx       ← 人物詳細・操作フォーム起動
    ├── SearchPersonPanel.tsx       ← ポジション一覧・人物追加
    ├── OperationPanel.tsx          ← 操作履歴リスト（Undo）
    ├── ExcelPreview.tsx            ← 発令一覧プレビュー + エクスポート
    ├── ClearSessionDialog.tsx      ← クリア確認（保存してクリア）
    ├── AIChatDrawer.tsx            ← AI アシスタント（addOperationGroup 経由で同一パス）
    └── forms/
        ├── types.ts                ← FormSubmitPayload・BaseFormProps
        ├── parts.tsx               ← OrgSelect・BandSelector・MetaSection 等
        ├── MoveToOrgForm.tsx
        ├── PromoteForm.tsx
        ├── SendOnSecondmentForm.tsx
        ├── RecallFromSecondmentForm.tsx
        ├── AddConcurrentForm.tsx
        └── RemoveConcurrentForm.tsx
```

---

## 9. メンテナンスポイント

### Excel の列が変わったとき

| 対象 | ファイル |
|---|---|
| 要員配置リストの列 | `src/domain/csvImport/allocationList/labels.ts` の `ALLOCATION_LIST_FIELDS` |
| after/before の対応 | `src/domain/allocationRow.ts` の `BEFORE_AFTER_FIELD_PAIRS` |
| 組織CD一覧の列 | `src/infrastructure/excelImport.ts` の `parseOrgMaster` 内ヘッダーキーワード |
| エクスポート列 | `src/utils/excelIO.ts` の `EXPORT_FIELDS`（labels.ts のフィルタ結果） |

### 組織マスタの階層構築（`orgMasterToEntities`）

| 優先度 | 方法 |
|---|---|
| ① | `上位組織コード` 列が存在し、かつコードがマスタ内にある → `parentId` に直接使用 |
| ② | BU/部門/統括部/グループ の名称一致で親を探す（fallback） |

- 組織マスタにないコードが要員配置リストに出てきた場合は `unassigned_*` ノード配下に自動追加。
