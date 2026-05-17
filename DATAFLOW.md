# データフロー設計書

## 概要

```
Excel ファイル
    │
    ▼
[インポート層]   src/infrastructure/excelImport.ts
    │
    ▼
[ドメイン層]    src/application/HRApplicationService.ts  ← 唯一の真実の源
    │                                                        （Before 状態 + 操作リスト）
    ├── applyOperations() → After 状態を毎回計算
    │
    ▼
[ストア層]      src/store/useStore.ts                   ← Zustand（UI との橋渡し）
    │
    ▼
[UI層]         src/components/                          ← 表示・操作
    │
    ▼
[エクスポート層] src/utils/excelIO.ts
    │
    ▼
Excel ファイル（元ファイルの要員配置リストシートを置換）
```

---

## 1. インポート（Excel → ドメイン）

### ファイル: `src/infrastructure/excelImport.ts`

#### 処理の流れ

```
importFromFile(file)
  ├── FileReader で ArrayBuffer を読み込む
  ├── _lastWorkbook / _lastFileName に保存（エクスポート時に再利用）
  ├── ファイル名から会社名を推定
  └── importWorkbook(wb, companyName)
        ├── [1] 各種TBL シート → parseCodeListsFromWorkbook() → AllCodeLists
        ├── [2] 組織CD一覧 シート → parseOrgMaster() → OrgMasterEntry[]
        │         → orgMasterToEntities() → { organizations, companies }
        └── [3] 要員配置リスト シート → parseAllocationSheet() → AllocationList[]
                  → buildBaseState() → BaseStateFromImport
```

#### 組織マスタの階層構築（`orgMasterToEntities`）

| 優先度 | 方法 | 条件 |
|---|---|---|
| ① | `上位組織コード` 列の値を `parentId` に直接使用 | 列が存在し、かつコードがマスタ内に存在する |
| ② | BU/部門/統括部/グループ の名称一致で親を探す | ① が使えない場合の fallback |

- 1 Excel = 1 社モデル。`companyId = 'imported_company'`（固定）。
- 組織マスタにないコードが要員配置リストに出てきた場合は `unassigned_imported_company` ノード配下に自動追加。

#### 列の自動検出（`parseOrgMaster`）

最初の 5 行以内でヘッダー行をスキャンし、以下のキーワードで列を特定する。

| 列の意味 | キーワードパターン |
|---|---|
| 上位組織コード | `上位組織コード` / `上位コード` / `親組織コード` |
| 組織コード | `^組織コード$` / `^コード$` |
| 組織名 | `組織名` / `名称` |
| 組織レベル | `組織レベル` / `レベル` |

ヘッダーが見つからない場合は `B=コード, C=BU, D=部門, E=統括部, F=グループ, G=チーム, H=レベル` にフォールバック。

#### 要員配置リストのマッピング（`parseAllocationSheet`）

- `ALLOCATION_LIST_FIELDS`（`src/domain/csvImport/allocationList/labels.ts`）の `header` と Excel ヘッダーをスコアマッチングして行を特定。
- `_新` サフィックスがある列 = After（発令後）状態。ない列 = Before（発令前）状態。
- `userId`（ユーザー/社員ID）が空の行はスキップ。

#### `buildBaseState`（`src/utils/excelIO.ts`）

各行に対して以下を生成する：

| ドメインエンティティ | 生成ルール |
|---|---|
| `Person` | `groupEmployeeId → sfPersonId → 氏名` の順で重複チェック。重複なければ新規作成。 |
| `Organization` | `prevDepartmentCode`（Before 優先）で org マスタを検索。ない場合は `unassigned_*` 配下に追加。 |
| `Company` | org に紐づく会社。見つからない場合は placeholder を作成。 |
| `Position` | `prevPositionCode`（Before 優先）をIDに使用。 |
| `Affiliation` | `prevConcurrentType === '兼務'` なら concurrent、それ以外は primary。 |

スキップ条件: `prevDepartmentCode / prevPositionCode / prevConcurrentType` と `departmentCode / positionCode / employmentType` がすべて空の行。

---

## 2. ドメイン状態管理

### `HRApplicationService`（`src/application/HRApplicationService.ts`）

アプリ全体で **シングルトン** として機能する唯一の状態管理クラス。

```
HRApplicationService
  ├── beforePositions    : Position[]      ← インポート時に確定したポジション
  ├── beforeAffiliations : Affiliation[]   ← インポート時に確定した在籍情報
  ├── operations         : Operation[]     ← ユーザーが追加した操作（順序付き）
  ├── organizations      : Organization[]
  ├── persons            : Person[]
  ├── companies          : Company[]
  └── codeLists          : AllCodeLists
```

#### After 状態の計算

```typescript
// getSnapshot() 内
const after = applyOperations(beforeAffiliations, beforePositions, operations, organizations)
// → after.positions, after.affiliations, after.organizations
```

`applyOperations` は毎回全 operations を順番に適用して After 状態を算出する。キャッシュなし。

#### 主要メソッド

| メソッド | 説明 |
|---|---|
| `initialize(repos)` | リポジトリから全データを読み込む |
| `addOperation(op)` | 操作を追加（preAdd で相殺・置換ルールを適用） |
| `removeOperation(id)` | 操作を削除 |
| `addNewHire(data)` | 新規採用：Person + Position + Affiliation を同時に Before 状態に追加 |
| `loadBaseState(data)` | インポートデータで Before 状態を置換、operations をクリア |
| `reset()` | 全状態をクリア |
| `simulate(op)` | 副作用なしで操作追加後の状態を計算 |

### Zustand ストア（`src/store/useStore.ts`）

`HRApplicationService` の変更通知（`subscribe`）を受けて Zustand の状態を同期する。UI が直接 `HRApplicationService` を呼ぶことはない。

```
HRApplicationService.emit() → useStore が set(snapshot) → React 再レンダリング
```

---

## 3. ドメインの操作体系（Operations）

`src/domain/operations/` 配下に操作ハンドラーが登録されている。

| 操作種別 (kind) | 内容 |
|---|---|
| `MoveToOrg` | 同一会社内での組織異動 |
| `SendOnSecondment` | 出向（別会社へ） |
| `RecallFromSecondment` | 出向戻り |
| `Promote` | 昇格（band 変更） |
| `AddConcurrent` | 兼務追加 |
| `RemoveConcurrent` | 兼務削除 |
| `CreateVacantPosition` | 空席ポジション作成 |
| `FillVacantPosition` | 空席ポジションへの人物配置 |

各ハンドラーは `preAdd`（追加前バリデーション/相殺）と `apply`（After 状態への適用）を持つ。

---

## 4. エクスポート（ドメイン → Excel）

### ファイル: `src/utils/excelIO.ts`

#### 処理の流れ

```
exportToXlsx(rows, effectiveDate, originalWorkbook?, originalFileName?)
  └── buildExportWorkbook()
        ├── EXPORT_FIELDS（labels.ts の header を使用）でシートを組み立て
        │     行0: グループヘッダー（本人情報 / After / Before / 除外）
        │     行1: 列ヘッダー（日本語名）
        │     行2〜: データ
        ├── originalWorkbook がある場合
        │     → 元ワークブックを複製し、要員配置リストシートだけ置換
        │        （他のシート・マクロはそのまま保持）
        └── ない場合
              → 新規ワークブックを作成
```

#### 「保存してクリア」フロー（`ClearSessionDialog`）

```
buildExportWorkbook() でワークブックを組み立て
  → showSaveFilePicker()（File System Access API）でユーザーが保存先を選択
      → XLSX.write() で ArrayBuffer 生成
      → FileSystemWritableFileStream に書き込み
      → 成功したら reset() + sessionReady = false
      → ユーザーがキャンセルした場合（AbortError）は何もしない
  ※ File System Access API 非対応ブラウザは XLSX.writeFile() でダウンロード
```

### `toAllocationRows`（`src/utils/allocationListMapper.ts`）

ドメイン状態 → 発令一覧行への変換。

```
ドメイン状態（persons, beforeAffiliations, afterAffiliations, …）
  │
  ├── 各 person の before/after 在籍情報を突き合わせ
  ├── before → prevXxx 列に配置
  ├── after → afterXxx 列（_新 サフィックス）に配置
  └── 操作の種別を申請区分（transferReason）に反映
```

---

## 5. メンテナンスポイント

### Excel の列が変わったとき

| 対象 | ファイル |
|---|---|
| 要員配置リストの列 | `src/domain/csvImport/allocationList/labels.ts` の `ALLOCATION_LIST_FIELDS` |
| 組織CD一覧の列 | `src/infrastructure/excelImport.ts` の `parseOrgMaster` 内ヘッダーキーワード |
| エクスポート列 | `src/utils/excelIO.ts` の `EXPORT_FIELDS`（= labels.ts のフィルタ結果） |

### 新しい操作種別を追加するとき

1. `src/domain/operations/` に新しいハンドラーファイルを作成
2. `src/domain/operations/index.ts` の `operationRegistry` に登録
3. 必要に応じてフォームコンポーネントを `src/components/forms/` に追加

### 会社（Company）の追加ロジック

現在は **1 Excel = 1 社**。将来複数社に対応する場合:

- `importFromFile` を複数回呼び、`loadBaseState` で追記する（現在は毎回 reset）
- または `HRApplicationService.mergeBaseState(data)` メソッドを新設して既存状態に追記する形にする

---

## 6. ファイルマップ

```
src/
├── infrastructure/
│   ├── excelImport.ts          ← メインのインポーター（3シート対応）
│   └── codeLists/
│       ├── excelParser.ts      ← 各種TBL シートのパーサー
│       └── localStorageRepository.ts
├── utils/
│   ├── excelIO.ts              ← buildBaseState / buildExportWorkbook / exportToXlsx
│   └── allocationListMapper.ts ← ドメイン → AllocationRow 変換
├── domain/
│   ├── applyOperations.ts      ← Before + Operations → After 状態
│   ├── operations/             ← 各操作ハンドラー
│   ├── codeLists/
│   │   ├── orgMaster.ts        ← OrgMasterEntry 型定義
│   │   └── aggregate.ts        ← AllCodeLists 型定義
│   └── csvImport/allocationList/
│       ├── labels.ts           ← ALLOCATION_LIST_FIELDS（列定義の中心）
│       └── schema.ts           ← AllocationList Zod スキーマ
├── application/
│   └── HRApplicationService.ts ← ドメイン状態の唯一の管理者
├── store/
│   └── useStore.ts             ← Zustand（UI ↔ HRApplicationService）
└── components/
    ├── MasterSetup.tsx         ← インポート画面
    ├── OverviewPanel.tsx       ← 組織ツリー（左パネル）
    ├── ExcelPreview.tsx        ← 発令一覧プレビュー + エクスポート
    ├── ClearSessionDialog.tsx  ← クリア確認ダイアログ
    └── SearchPersonPanel.tsx   ← ポジション・人物追加
```
