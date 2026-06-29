# キャンバス汎用ツリーアーキテクチャ

## 背景と動機

キャンバスには「after（新）組織」と「before（旧）組織」の2つのツリー描写コンテキストがある。  
リファクタリング前は `TreeNode`/`TreeWindow`/`TreeWindowCanvas`（after側）と `BeforeTreeNode`/`BeforeTreeWindow`/`BeforeTreeWindowCanvas`（before側）が **別実装** として存在し、以下の問題を抱えていた。

- 組織ルックアップがすべて `array.find()` → 3000組織 × N行 = 最悪 O(3000×N) の繰り返し検索
- 展開/折りたたみ・childrenMode トグルのロジックが2箇所に重複
- 新しいビューモード（band 以外）を追加するとき両側に手を入れる必要がある

## 解決した設計

```
apps/web/src/components/canvas/
  generic/
    types.ts           ← アダプタインターフェース・OrgTreeConfig 型
    OrgTreeNode.tsx    ← 汎用再帰ノード（after/before 両対応）
    OrgTreeControls.tsx ← 展開/折りたたみコントロールバー（汎用）
    OrgTreePanel.tsx   ← パネルシェル（ドラッグ・ResizeObserver）
  tree/
    TreeWindow.tsx     ← after 側ラッパー（OrgTreePanel を使用）
    TreeWindowHeader.tsx ← after 側ヘッダー（AddRowDropdown・バンドトグル）
  before/
    BeforeTreeWindow.tsx ← before 側ラッパー（OrgTreePanel を使用）
  treeWindowLayout.ts  ← レイアウト計算（Map 使用・O(1) ルックアップ）
```

### 核心: 状態スコープの3層分離

展開/折りたたみに関連する状態は「スコープ」が異なる。これを混同しないことが設計のポイント。

| 状態 | スコープ | 格納場所 |
|---|---|---|
| `panelViewMode` (tree/band) | **全パネル共通** | `canvasLayoutStore` の1変数 |
| `childrenMode` ('windowed'/'inline') | **パネル個別** | `PanelDef.childrenMode` |
| `collapsedOrgIds` | **パネル個別** | `PanelDef.collapsedOrgIds` |
| `open` (パネル展開/折りたたみ) | **パネル個別** | `PanelDef.open` |

`panelViewMode` は「ボタン1つで全パネルを一斉切り替え」なので store の1変数で十分。  
`childrenMode` と `collapsedOrgIds` はパネルごとに独立して切り替えるので `PanelDef` に内包する。

---

## `PanelTreeAdapter` — ストア操作の抽象化

`OrgTreeNode` はどのストアを使うか知らない。`PanelTreeAdapter` という薄いインターフェース越しに操作する。

```typescript
interface PanelTreeAdapter {
  getPanelByOrgId:  (orgId: string) => PanelDef | undefined
  getChildrenMode:  (panelId: string) => ChildrenMode
  openOrg:          (orgId: string) => void
  closeOrg:         (orgId: string) => void
  addPanel?:        (orgId: string, opts?) => void  // after 側のみ
}
```

| after 側の実体 | before 側の実体 |
|---|---|
| `panels` 配列を参照 | `comparisonPanels` 配列を参照 |
| `setOrgOpen(id, true/false)` | `setComparisonOrgOpen(id, true/false)` |
| `addPanel(id)` あり | **`addPanel` は `undefined`** |

before 側に `addPanel` が不要な理由: `initComparisonPanels()` でマウント時に全組織のパネルを一括作成済みなので、「パネルを新規追加する」操作が存在しない。

---

## `OrgTreeNode` — 展開/折りたたみの動作原理

`OrgTreeNode` は2種の childrenMode に対応する。

### windowed モード（子組織が別ウィンドウ）

```
[子組織チップ ▼] → panel.open === true  → click → adapter.closeOrg(child.id)
[子組織チップ ▶] → panel.open === false → click → adapter.openOrg(child.id)
                                                   または adapter.addPanel(child.id)
```

after 側では `addPanel` があるため「パネルが存在しない場合は新規作成」「存在する場合は open にする」を切り替える。before 側では常に `openOrg` のみ。

### inline モード（子組織を内側に展開）

collapsed 状態は **`panel.collapsedOrgIds`（ストア管理）** から `ReadonlySet<string>` として受け取る。

```
collapsedOrgs.has(child.id) === true  → ▶チップ表示 → click → onOrgExpand(child.id)
collapsedOrgs.has(child.id) === false → InlineOrgSection（再帰描写）
```

`onOrgCollapse`/`onOrgExpand` は `TreeWindow`/`BeforeTreeWindow` が提供するコールバックで、それぞれ `setCollapsedOrgIds` / `setComparisonCollapsedOrgIds` を呼ぶ。`OrgTreeNode` 自身はストアを参照しない。

フォールバックとして `useState` によるローカル collapsed 状態を持つ（コールバックが渡されない場合）。

---

## `OrgTreeConfig` — 描写内容の抽象化

ツリーの「中身」（どんなカードを描写するか）も抽象化する。

```typescript
interface OrgTreeConfig {
  orgs:             Organization[]
  orgById:          Map<string, Organization>   // O(1) ルックアップ
  childrenByOrgId:  Map<string, Organization[]> // O(1) 子組織取得
  getItemCount:     (orgId: string) => number
  renderItems:      (orgId: string, panelId: string) => ReactNode  // ツリーモード描写
  renderFlatItems?: (orgId: string, panelId: string) => ReactNode  // バンドモード描写
  renderOrgExtra?:  (orgId: string) => ReactNode                   // AddRowDropdown 等
  showEmptyOrgs?:   boolean   // after=true（ドロップ先）, before=false
  getHeaderBg:      (orgId: string) => string
  accentColor:      'blue' | 'amber'
  dragHandlers?:    OrgDragHandlers  // after 側のみ
  selectedOrgId?:   string
  onSelectOrg?:     (orgId: string) => void
}
```

`renderItems` はクロージャで文脈固有データ（`positionTreeByOrgId` や `beforeRowsByOrgId`）を捕捉するので、`OrgTreeNode` はデータ取得方法を知らない。

---

## パフォーマンス改善

### 改善前: `array.find()` による O(N) 検索

```typescript
// 旧: 子組織を取得するたびに全3000件を線形検索
const childOrgs = organizations.filter(o => o.parentId === orgId)
const org = orgs.find(o => o.id === panel.orgId)  // 各パネルごとに実行
```

### 改善後: Map による O(1) ルックアップ

```typescript
// 新: useMemo で1回だけ構築、以降は O(1)
const orgById = useMemo(() => new Map(organizations.map(o => [o.id, o])), [organizations])
const childrenByOrgId = useMemo(() => {
  const m = new Map<string, Organization[]>()
  for (const o of organizations) {
    if (!o.parentId) continue
    const arr = m.get(o.parentId)
    if (arr) arr.push(o)
    else m.set(o.parentId, [o])
  }
  return m
}, [organizations])
```

### `beforeRowsByOrgId` の改善

旧実装は O(3000 × N)（3000組織 × 全行数で filter）。新実装は O(N + 3000)。

```typescript
// 旧: for (const org of beforeOrganizations) { allocationList.filter(...) }
// 新: allocationList を1回だけ走査して Map を構築
const codeToOrgId = new Map(beforeOrganizations.map(o => [o.externalCode, o.id]))
for (const row of allocationList) {
  const orgId = codeToOrgId.get(row.prevDepartmentCode)
  // map.set(orgId, [...])
}
```

### `treeWindowLayout.ts` の改善

`computeLayout`・`isStandaloneWindow`・`buildConnections` の引数を `Organization[]` → `Map<string, Organization>` に変更。

```typescript
// 旧: orgs.find(o => o.id === panel.orgId)  // O(3000) × パネル数
// 新: orgById.get(panel.orgId)               // O(1) × パネル数
```

---

## ビューモード拡張方法

現在のビューモードは `'tree' | 'band'`（`PanelViewModeId` 型）。新しいモードを追加する手順:

1. `canvasLayoutStore.ts` の `PanelViewModeId` に新しいモード名を追加
2. `VIEW_MODE_WIDTHS` にパネル幅を追加
3. `OrgTreeConfig.renderFlatItems` にそのモード用の描写を実装（`TreeWindow.tsx` のクロージャ内）
4. `OrgTreePanel.tsx` の `renderBody()` でモードに応じた描写を呼び分け

「ツリーモード以外はフラット描写」という設計なので、ツリー以外の新モードは `renderFlatItems` スロットに実装するだけでよい。

---

## ドラッグ操作の3層構造

キャンバスのドラッグ操作は「ビュー固有の層」と「共有の層」を明確に分離する。

```
[層1] ドラッグ元バインド   どのコンポーネントが draggable か
         ↓
[層2] ドロップゾーン       どこに落とせるか・何を「対象」とみなすか
         ↓
[層3] 解決ロジック         ドロップが成立したら何のフォームを開くか
```

**層1・2 はビューモードごとに必然的に異なる**。ツリーモードでは `RowCard` がドラッグ元で org セクションがドロップ先、バンドモードでは `NameChip` がドラッグ元でバンドラベル行がドロップ先になる。これは同じコンポーネントを使えないという冗長性ではなく、ビューが変わると操作対象が変わるという必然的な分離。

**層3 は完全に共有**。どの描写モードからドラッグが起きても、最終的に `DropOpState` → `DropOperationModal` / `QuickEditDialog` という同一パイプラインに合流する。

### 実装上の対応関係

| 操作の種類 | 層1・2（ビュー固有） | 層3（共有パイプライン） |
|---|---|---|
| 組織間異動 | `RowCard` drag → `OrgDragHandlers.handleDrop` | `useDropIntent` → `DragIntentPicker` → `DropOperationModal` |
| バンド間昇降格 | `NameChip` drag → `BandMatrixPanel` バンドラベル drop | `openBandDrop` → `QuickEditDialog`（→「詳細編集」で `DropOperationModal`） |

### 新しいドラッグ操作を追加するとき

1. **ドラッグ元**（層1）: 対象コンポーネントに `draggable` + `onDragStart` を追加し、`DataTransfer` に `rowId` と文脈データを格納する
2. **ドロップ先**（層2）: ドロップゾーンとなる要素に `onDragOver` / `onDragLeave` / `onDrop` を追加する
3. **解決**（層3）: `onDrop` の末尾で `openDropOp` / `openBandDrop` / `setDropIntentState` のいずれかを呼ぶ。操作の種類が常に一意なら `openDropOp` 直行（インテント選択不要）、複数の操作候補があるなら `setDropIntentState` で `DragIntentPicker` を経由する
4. **汎用層（`generic/`）は変更しない**。`OrgTreeConfig.renderFlatItems` はクロージャなので、ドラッグ状態の注入は呼び出し側（`TreeWindow` 等）のクロージャで完結する

---

## ComparisonOrgPanel への適用

`ComparisonOrgPanel`（出向先の組織を比較表示するパネル）も同じ `OrgTreeConfig` + `PanelTreeAdapter` パターンで統合可能。  
after側データ + before側データの両方を「別の `renderItems` クロージャ」として渡せばよく、追加のジェネリック化は不要。
