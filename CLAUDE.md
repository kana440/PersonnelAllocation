# CLAUDE.md — PersonnelAllocation プロジェクト

> **ワークスペース別 CLAUDE.md**（各ディレクトリで作業するときは合わせて参照）
> - [`packages/domain/CLAUDE.md`](packages/domain/CLAUDE.md) — EditCommand 実装・FIELD_CONSTRAINTS・型チェック
> - [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — コンポーネントパターン・状態管理・Feature Flags・テスト
> - [`apps/server/CLAUDE.md`](apps/server/CLAUDE.md) — ルートパターン・認証 stub・DBスキーマ規約

## コマンド

```bash
# Web アプリ
npm run dev               # STEP1 開発サーバー（VITE_APP_MODE=step1 デフォルト）
npm run dev:step1         # 明示的に STEP1 モードで起動
npm run dev:step2         # STEP2 モードで起動（.env.local 設定不要）
npm run build             # 本番ビルド
npm run test              # vitest（apps/web 内）

# サーバー（STEP2 DEV）
npm run dev:server        # Hono + PGlite サーバー起動（port 3000）
npm run db:reset          # PGlite データをリセット

# 型チェック（推奨: まとめて実行）
npm run typecheck         # 全パッケージ一括（web + server + domain）

# 型チェック（個別）
npm run typecheck:web     # apps/web のみ
npm run typecheck:server  # apps/server のみ
npm run typecheck:domain  # packages/domain のみ

# アーキテクチャ境界チェック（apps/web から実行）
cd apps/web && npx depcruise src --config .dependency-cruiser.cjs
```

---

## モノレポ構成

```
repo root/
  packages/
    domain/src/          ← ドメイン層（外部依存ゼロ。Zod のみ可）
                            apps/web・apps/server の両方から @personnel/domain として参照
  apps/
    web/src/             ← React Web UI（STEP1 本体 + 管理画面）
      application/       ←   HRApplicationService・aiTools（アプリケーション層）
      infrastructure/    ←   Excel・AI・LocalStorage 実装・adminApi（インフラ層）
      components/        ←   React コンポーネント（UI 層）
        admin/           ←     管理画面（AdminView・UserTable・UserEditModal）
      store/             ←   Zustand ストア（UI 層）
      ports/             ←   インターフェース定義
    server/src/          ← バックエンド（STEP2 デモ用・Hono + PGlite/Aurora）
      db/                ←   Drizzle スキーマ・DB接続（アダプタ切り替え）
      routes/            ←   API ルート（auth / rounds / submissions / admin/*）
      auth/              ←   認証スタブ（X-User-Id ヘッダー切り替え）
  docs/                  ← 設計ドキュメント
  specs/                 ← 実装仕様
```

**import パス**: `packages/domain/src/` のコードは `@personnel/domain/xxx` としてインポートする。

---

## アーキテクチャ：依存の向きは外→内のみ

```
apps/web/src/components/  apps/web/src/store/   ← UI 層
apps/web/src/application/                        ← アプリケーション層
  importMerge.ts
  setup/afterInit.ts
apps/web/src/infrastructure/                     ← インフラ層（Excel・AI・LocalStorage）
apps/web/src/ports/                              ← インターフェース定義

packages/domain/src/                             ← ドメイン層（外部依存ゼロ。Zod のみ可）
  allocationRow.ts        ← AllocationRow 型・FIELD_METADATA
  context.ts              ← DomainContext・RowContext（全ドメイン処理の共通コンテキスト）
  masters/                ← マスタデータ型定義・集約（AllCodeLists）
  fieldConstraints.ts     ← FIELD_CONSTRAINTS（許容値制約の単一定義ソース）
  validation/             ← バリデーション A〜G・W 系（純粋関数）
  commands/               ← 業務操作（EditCommand・OperationDef・シナリオ）
    types.ts              ←   EditCommand インターフェース・DomainContext 再エクスポート
    handlers/             ←   EditCommand 実装群
    defs/                 ←   OperationDef 宣言群（メニュー条件・フォーム定義）
    scenarios.ts          ←   複合操作（EditScenario）
    helpers.ts            ←   isRegularEmployee 等の判定ヘルパー
  patterns/               ← 変更パターン分類・検出
    editPatterns.ts       ←   EditPattern 定数
    editPatternMatcher.ts ←   EditPatternMeta（label/group/detect 等）の集約
    changeDetection.ts    ←   detectChanges() 後方互換シム
    groupPatternMatcher.ts ←  グループ行（出向2行等）のパターン検出
    defs/                 ←   パターンごとの detect() 実装（jobClassification / position / person / secondment / legacy）
    detection/            ←   detectPatterns()・DetectContext・isNoCheckReason
  choices/                ← UI 選択肢・表示用ユーティリティ
    index.ts              ←   選択肢の生成・絞り込み（FIELD_CONSTRAINTS から導出）
    orgTree.ts            ←   組織ツリー操作（getDescendantOrgIds・flattenOrgTree）
    rows.ts               ←   行・人物の表示用変換（buildOrgMap・derivePersons）
    relevantOrgs.ts       ←   組織ピッカー候補の絞り込み
  derivation/             ← フィールド自動導出（組織・上司名・昇降格）
  csvImport/              ← Excel/CSV 解釈（純粋関数）
```

**絶対に守るルール**: `packages/domain/src/` は `apps/web/` や `apps/server/` をインポートしない。

---

## STEP1 / STEP2 共存設計

STEP1（Excel ローカル運用）と STEP2（サーバー・SSO・Round 管理）は画面動線が根本的に異なるため、**別のアプリシェル**として実装する。共通コアのみ共有する。

### 環境変数（2変数）

| `VITE_APP_MODE` | `VITE_AUTH_MODE` | 用途 |
|---|---|---|
| `step1`（デフォルト）| `none` | STEP1 本番 |
| `step2` | `stub` | STEP2 DEV（Hono + SQLite）|
| `step2` | `sso` | STEP2 本番（Aurora + SAML）|

### EditViewCore スロットパターン

`EditViewCore`（`apps/web/src/components/editor/EditViewCore.tsx`）が両シェル共通の骨格。4スロットで差し替える。

```typescript
interface Props {
  headerLeft:  ReactNode  // タイトル・スコープ等（← 戻るボタンも含む）
  headerMid?:  ReactNode  // STEP1 専用ボタン群（マージ・担当者割当・分割エクスポート）
  headerRight: ReactNode  // 右端アクション（STEP1: 管理+クリア / STEP2: 提出）
  topBanner?:  ReactNode  // ヘッダー直下のバナー（STEP2 の差し戻しコメント等）
}
```

- STEP1 の `App.tsx`・STEP2 の `Step2App.tsx` がそれぞれ `EditViewCore` にスロットを渡す
- 共通ロジック（LeftSidebar・キャンバス・AI チャット・履歴パネル）は `EditViewCore` 内に固定
- STEP2 専用 UI は `headerRight` か `topBanner` に配置する

詳細は `docs/02-architecture.md` の「STEP1 / STEP2 共存アーキテクチャ」セクション参照。

---

## 業務操作の追加方法（最重要）

操作フレームワークの設計思想は `docs/05-operation-framework.md` を参照。

### 概念の対応関係

| 名称 | コード上の実体 | 意味 |
|---|---|---|
| `EditCommand` | `packages/domain/src/commands/types.ts` | 単行の原子操作。UndoStack 差分単位 |
| `EditScenario` | `packages/domain/src/commands/scenarios.ts` | 複合操作。1件でも複数件でも同じ構造 |
| `EditPattern` | `packages/domain/src/patterns/editPatterns.ts` | 操作の分類ラベル。表示・集計・メニュー用 |
| `EditOperation` | `packages/domain/src/commands/defs/` | メニュー条件・フォーム定義・ライフサイクル（`onOpen`/`onFieldChange`/`onValidate`/`onSubmit`） |
| `MultiRowOperationDef` | `packages/domain/src/commands/defs/index.ts` | 2行以上を同時に操作するフォーム定義（例：SF外本務出向の出向元＋受入行2行セット） |
| `SecondmentOutChooser` | `apps/web/src/components/editor/PersonOperationPanel/SecondmentOutChooser.tsx` | 本務出向の SF/非SF 判定ルーティングステップ（会社名入力・手動切り替え付き） |

設計思想の詳細は `docs/05-operation-framework.md` を参照。

### 単一操作の追加

新しい業務変更は必ず `EditCommand` として実装する。直接 `allocationList` を変更しない。

```typescript
// packages/domain/src/commands/handlers/myOp.ts
export class MyOperation implements EditCommand {
  readonly kind = 'myOperation'
  constructor(private readonly rowId: number) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail('対象行が見つかりません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const updated = ctx.allocationList.map(r =>
      r.rowId === this.rowId ? { ...r, /* 変更 */ } : r
    )
    return { updatedList: updated, label: '説明' }
  }
}
```

```typescript
// 呼び出し側（単一操作）
appService.executeOperation(new MyOperation(rowId))

// 呼び出し側（複合操作・玉突き等）
appService.executeScenario({ label: '部長交代', commands: [cmdA, cmdB, cmdC] })
// → 各 Command を順に validate/apply → txId 付与 → 1つの StatePatch → UndoStack
```

**新しい操作を追加するときの手順**（必ずこの順序で）:
1. `EditPattern` に新ラベルを追加（`packages/domain/src/patterns/editPatterns.ts`）
2. `packages/domain/src/patterns/defs/` の該当ファイルに `detect()` を実装する
3. `EditCommand` の実装を追加（`packages/domain/src/commands/handlers/`）
4. **バリデーションに検出条件を追加**（リストア保証の維持・必須）
5. `EditOperation` を追加（`packages/domain/src/commands/defs/`）して `DEFS` 配列に登録
6. **`SummaryView.tsx` の `SECTIONS` に追加**（`apps/web/src/components/editor/PersonOperationPanel/SummaryView.tsx`）— これを忘れると UI に表示されない
7. 複数行にまたがる操作なら `EditScenario` を組み立てる（`packages/domain/src/commands/scenarios.ts`）

手順 4 を省略すると Excel 後方互換のリストア保証が崩れる。

既存の実装例: `packages/domain/src/commands/handlers/positionOps.ts`（4種）, `directEdit.ts`, `moveRowsToOrg.ts`
TDD ガイド: `docs/07-tdd-guide.md`

### 取消操作のパターン（セッション内取消・トグル）

「操作 X を実行した後に取り消せる」UIを作るときは、**別の `EditOperation`（`XCancelDef`）を `availableFor` の条件で排他制御する**。

```typescript
// 例: 休職 / 休職取消
export const leaveOfAbsenceDef: EditOperation = {
  availableFor: (row) => !!row.userId && !row.leaveOfAbsenceSign,
  // ...
}
export const leaveOfAbsenceCancelDef: EditOperation = {
  availableFor: (row) => !!row.leaveOfAbsenceSign && !row.prevLeaveOfAbsenceSign,
  inputs: [],   // 確認なしで即実行
  onSubmit: (ctx, rowId) => new DirectEditOperation(rowId, { leaveOfAbsenceSign: undefined, transferReason: undefined }, '休職取消').apply(ctx),
}
```

- `prevXxx` フィールドを見て「セッション内で設定した値か（prev=空）」「元から設定済みか（prev=値あり）」を区別する
- 取消は `DirectEditOperation` でフィールドを `undefined` に戻すだけでよいことが多い
- 取消定義も `DEFS` 配列と `SummaryView.tsx SECTIONS` の両方に追加すること

### 排他ロック（`operationRole`）

行レベルの相互排他制御。特定の操作を実行した行で他の操作をブロックする。

```typescript
// lock: 実行すると行をロック状態にする
operationRole: {
  kind:                'lock',
  isActive:            (row) => !!row.leaveOfAbsenceSign,           // インポート前も含む
  isActiveThisSession: (row) => !!row.leaveOfAbsenceSign && !row.prevLeaveOfAbsenceSign,  // セッション内のみ
}

// lockCancel: 対応する lock を取り消す
operationRole: { kind: 'lockCancel', of: 'LeaveOfAbsence' }
```

**ロック中でも同一操作（同じ `def.id`）は再実行して値を修正できる。** `lockCancel` のみが取消可能。詳細は `docs/05-operation-framework.md#排他ロック` 参照。

### `EditOperation` の補足オプション

```typescript
export const myDef: EditOperation = {
  // ...
  description: 'フォーム上部に表示する業務注意事項テキスト',

  // supportsLeaveVacant: true のとき DragIntentPicker でこのカード内に
  // 「元のポジションを空席として残す」チェックボックスを表示（orgTransferDef のみ true）
  supportsLeaveVacant: true,

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    // inputType: 'checkbox' → truthy/falsy をチェックボックスで表示（readOnly と組み合わせて固定値の確認に使う）
    { field: 'leaveOfAbsenceSign', required: true, readOnly: true, inputType: 'checkbox', label: '休職フラグ' },
    { field: 'memo', required: false },
  ],
}
```

### 2行以上の操作（`MultiRowOperationDef`）

複数行を同時に変更する操作（例: SF外本務出向 = 出向元行更新＋受入行新規作成）は `MultiRowOperationDef` で定義する。`EditOperation` ではなく `MULTI_ROW_DEFS` 配列に登録し、`SummaryView.tsx` の `SECTIONS` には `multiRowId` で参照する。

```typescript
// packages/domain/src/commands/defs/someOp.ts
export const myMultiRowDef: MultiRowOperationDef = {
  id: 'MyMultiRow',
  label: '操作名',
  sections: [
    { label: '行1', inputs: [...], isNewRow: false },
    { label: '行2（新規）', inputs: [...], isNewRow: true },
  ],
  createCommand: (anchorRowId, sectionValues, ctx) => new MyMultiRowCommand(anchorRowId, sectionValues),
  availableFor: (row, ctx) => ...,
}
```

ルーティングステップ（`SecondmentOutChooser` 等）から `MultiRowFormView` に初期値を渡す場合は `PanelView` の `overrideSectionVals` を使う（`docs/05-operation-framework.md` 参照）。

---

## 中心データ型: AllocationRow

`packages/domain/src/allocationRow.ts` が全フィールドを定義。Excel の 1 行 ≒ 1 レコード。

**重要なフィールド**:

| フィールド | 意味 |
|---|---|
| `rowId` | セッション内連番（主キー）。Excel 上には存在しない |
| `positionCode` | ポジション（席）の識別子。`_pos_` プレフィックス = 内部採番（Excel 出力時 blank） |
| `userId` | 在席者の SF Person ID。`undefined` = 空席 |
| `departmentCode` | 組織の externalCode（SF department code） |
| `concurrentType` | `'兼務'` = 兼務行。`undefined` = 本務行 |
| `prevXxx` | before 状態のコピー。インポート時に設定、変更しない |

**AllocationRow の 4 状態**:
- `positionCode` あり + `userId` あり → 在席
- `positionCode` あり + `userId` なし → 空席ポジション
- `positionCode` なし + `userId` あり → 未アサインメンバー
- 両削除フラグ → 削除済み（Excel 出力: 移動区分=削除）

**FieldBinding**: 各フィールドは `position` / `person` / `both` / `allocation` / `meta` に分類される（`FIELD_METADATA` 参照）。操作時にどのフィールドを引き継ぐかを制御する。

---

## Undo/Redo の仕組み

`apps/web/src/application/UndoStack.ts` が差分管理（全スナップショットではなく変更行のみ保持）。

```
executeOperation(op)
  → undoStack.computePatch(before, after)  // 変更行の diff
  → undoStack.push(patch)                  // MAX_UNDO=50
  → allocationList を新状態に更新
  → emit()
```

`undo()` / `redo()` は `undoStack.undo()` → `undoStack.applyPatch()` で巻き戻す。

---

## 状態管理

**`HRApplicationService`**（`apps/web/src/application/`）が唯一の真の状態（Single Source of Truth）。

- `appService.executeOperation(op)` — Undo 対象の操作実行
- `appService.saveRow(rowId, changes)` — フィールド直接編集（`DirectEditOperation` に委譲）
- `appService.getSnapshot()` — `DomainSnapshot` を返す（Zustand はこれを subscribe）
- `appService.loadExcelData(data)` / `mergeExcelData(data)` — インポート

`useStore` / `useScopedStore` 経由で UI が subscribe する。**UI コンポーネントから `appService` を直接参照しない**（`OrgOperationView` など一部例外あり）。

**`canvasLayoutStore`**（`apps/web/src/store/canvasLayoutStore.ts`）はキャンバスレイアウトの UI 状態（組織パネルの一覧・並び順）を管理する独立した Zustand ストア。`HRApplicationService` の Undo 対象外。Excel 読み込み時・セッションリセット時に自動クリアされる。

キャンバスのパネル状態には**3つのスコープ**がある：

| 状態 | スコープ | 格納場所 |
|---|---|---|
| `panelViewMode: PanelViewModeId` | **全パネル共通** | `canvasLayoutStore` の1変数 |
| `childrenMode: 'windowed' \| 'inline'` | **パネル個別** | `PanelDef.childrenMode` |
| `collapsedOrgIds: string[]` | **パネル個別** | `PanelDef.collapsedOrgIds` |
| `open: boolean` | **パネル個別** | `PanelDef.open` |

- `panelViewMode` の切り替えは `setPanelViewMode(mode)` を使う（`togglePanelViewMode` は廃止）
- `panelViewMode` の UI コントロールは**キャンバスヘッダー（`OrgOperationView`）に置く**。各パネルヘッダーには置かない（グローバル状態なのにパネルごとにボタンを持つのは誤り）
- パネル幅は `VIEW_MODE_WIDTHS[panelViewMode]` で取得する（`=== 'band' ? 208 : 288` のハードコードをしない）

---

## AI ツール

`apps/web/src/application/aiTools.ts` は barrel re-export。実装は `aiTools/` フォルダに分散している。

```
application/aiTools/
  index.ts      ← createAITools() エクスポート。4グループをマージ
  read.ts       ← findPersons / getOrgMembers / getVacantPositions 等（read-only）
  write.ts      ← proposeOrgTransfer / proposeDemotion 等（ドメイン変更）
  review.ts     ← getReviewSummary / getChangedPersons / getValidationIssues
  diagnose.ts   ← diagnosePersonChanges（詳細 diff 診断）
  orgTree.ts    ← buildOrgTree（ツリー構築ユーティリティ）
  types.ts      ← 共有型
```

新しい操作を AI に公開するときは **該当カテゴリの `*Methods` ファクトリ関数に追加**する。`HRApplicationService` の既存メソッドに委譲し、ロジックを重複して書かない。

**LLM プロトコル層**（ツール定義）は `apps/web/src/infrastructure/ai/toolRegistry/` で管理する:
- `readTools.ts` / `renderTools.ts` / `navigateTools.ts` / `operationTools.ts` — ToolEntry 定義
- `index.ts` — 集約・ルーティング（`execute` / `confirm` / `render` / `navigate` / `read` の5種）

ツール名プレフィックス規約: `find*/get*` = 読み取り系、`propose_*` = ドメイン変更、`ui_*` = ナビゲーション専用

---

## コンポーネント設計ルール

**1ファイルの上限は約 200 行**。超える場合はフォルダ構成に切り出す。

```
components/foo/
  index.tsx      ← 外部向け export のみ（オーケストレーター）
  SubPartA.tsx   ← 内部コンポーネント
  SubPartB.tsx
  types.ts       ← 共有型
  helpers.ts     ← 純粋関数ヘルパー
```

**キャンバスコアツリーパターン**: after/before 両サイドのキャンバスツリーは `apps/web/src/components/canvas/core/` に統一実装がある。新しいビューコンテキスト（出向先比較など）を追加するときはこれを使う。コンテキスト固有の実装（`after/TreeWindow`・`before/BeforeTreeWindow`）はラッパーにすぎない。

```
canvas/core/
  types.ts            ← PanelTreeAdapter・OrgTreeConfig・PanelViewModeId 等の型
  OrgTreeNode.tsx     ← ストア非依存な再帰ノード（Prop で完結）
  OrgTreeControls.tsx ← 展開/折りたたみコントロールバー
  OrgTreePanel.tsx    ← パネルシェル（ドラッグ・ResizeObserver）
```

**`PanelTreeAdapter`** パターン: `OrgTreeNode` はストアを一切参照しない。`adapter.openOrg` / `adapter.closeOrg` / `adapter.addPanel?` を通じて抽象化する。after 側は `addPanel` あり、before 側は `undefined`（初期化時に全パネル作成済みのため不要）。

**`OrgTreeConfig`** パターン: ツリーの「中身」（カード描写・ヘッダー色・ドラッグ有無）は `OrgTreeConfig` オブジェクトとしてクロージャで渡す。新しいビューコンテキストを追加するとき、`OrgTreeNode` 本体は変更しない。

**キャンバスの組織 Map ルール**: キャンバス内では `organization.find()` による線形検索を書かない。`useMemo` で `Map<string, Organization>` と `Map<string, Organization[]>`（childrenByOrgId）を構築して O(1) ルックアップを使う。

```typescript
// ✅ 推奨
const orgById        = useMemo(() => new Map(organizations.map(o => [o.id, o])), [organizations])
const childrenByOrgId = useMemo(() => { /* 1回走査で構築 */ }, [organizations])

// ❌ NG（3000組織では全パネル×全描写で O(N×M) になる）
const org = organizations.find(o => o.id === panel.orgId)
```

**`beforeRowsByOrgId` の構築ルール**: `allocationList` を1回走査して Map を構築する。組織ごとに `filter()` するとO(3000×N) になる。

```typescript
// ✅ O(N + 3000)
const codeToOrgId = new Map(beforeOrganizations.map(o => [o.externalCode, o.id]))
for (const row of allocationList) {
  const orgId = codeToOrgId.get(row.prevDepartmentCode)
  // map に積む
}
// ❌ O(3000 × N)
for (const org of beforeOrganizations) {
  allocationList.filter(r => r.prevDepartmentCode === org.externalCode)
}
```

**レビューエリアの OrgTreePanel パターン**: レビューエリアで検索＋組織ツリーを使うときは
`apps/web/src/components/review/components/OrgTreePanel.tsx` を再利用する。
コピーしてローカルに書かない。

**OrgPickerModal パターン**: 組織をモーダルで選択させるときは
`apps/web/src/components/common/OrgPickerModal` を使う。階層ツリー表示・検索・追加済み表示を統一提供する。
インラインのドロップダウンで代替しない。

**左サイドバー構造**:
```
LeftSidebar（sidebar/LeftSidebar.tsx）
  通常モード: OrgSearchSidebar のみ
  比較モード: タブ切り替え
    ├── 新組織タブ → OrgSearchSidebar（組織ツリー・人物一覧）
    └── 旧組織タブ → BeforeOrgSearchSidebar（旧組織ツリー）

OrgSearchSidebar（sidebar/OrgSearchSidebar.tsx）
  ├── 検索インプット（組織名・人名）
  ├── VirtualOrgTree（組織ツリー + 人物一覧、flex-1）
  └── UnmappedOrgSection（旧組織・未割当、下部固定・最大 45% 高さ）
        └── VirtualUnmappedList（仮想スクロール）
```

**「未設定」vs「未割当」の区別**（紛らわしいので注意）:
- `UnassignedCard`（組織**未設定**）: `departmentCode` が空の行。`canvas/StripBar/UnassignedCard.tsx` に定義。
- `UnmappedOrgSection`（旧組織・**未割当**）: `departmentCode` が新組織マスタに存在しない行。`OrgSearchSidebar` 下部に常時表示。

**注意**: `canvas/StripBar/index.tsx`（`PanelTabContent`）と `canvas/LeftPalette/index.tsx`（`LeftPalette`）は現在どこからもインポートされていない孤立コンポーネント。混同しないこと。

- 組織パネルの状態は `canvasLayoutStore` が管理し、Excel 読み込み時にリセットされる

---

## 管理画面の配置方針

**管理画面 UI は `apps/web` に統合する**。`apps/admin` などの別パッケージは作らない。

- React・Tailwind・共通コンポーネントをそのまま再利用できる
- 別パッケージにすると Vite 設定・tsconfig・依存が全部複製になり、維持コストが見合わない
- `VITE_BACKEND_MODE=local-server` の Feature Flag で出し分けるため、別デプロイ単位にする必要もない

```
apps/web/src/components/admin/   ← 管理画面コンポーネントはここ
  AdminView/
    index.tsx              ← オーケストレーター（タブ切り替え）
    UserTable.tsx          ← ユーザー一覧テーブル
    UserEditModal.tsx      ← ユーザー追加・編集モーダル
    BulkRegisterModal.tsx  ← ユーザー一括登録
    RoundTab.tsx           ← ラウンド管理タブ
    RoundCreateModal.tsx   ← ラウンド新規作成
    RoundDetailView.tsx    ← ラウンド詳細・提出状況
    SessionTable.tsx       ← セッション一覧
    DelegationModal.tsx    ← 委任設定
    PositionTable.tsx      ← ポジション一覧
    PositionEditModal.tsx  ← ポジション編集
    ...（画面が増えたらここに追加）
apps/web/src/infrastructure/api/
  adminApi.ts         ← 管理 API クライアント（apps/server の /api/admin/* を呼ぶ）
```

**新しい管理画面を追加するとき**:
1. `apps/server/src/routes/admin/` に Hono ルートを追加
2. `apps/web/src/infrastructure/api/adminApi.ts` に API クライアントメソッドを追加
3. `apps/web/src/components/admin/AdminView/` にコンポーネントを追加し、`AdminView` のタブに登録

---

## 値制約・選択肢の追加方法（FIELD_CONSTRAINTS）

`packages/domain/src/fieldConstraints.ts` がフィールドの許容値制約の**単一定義ソース**。
バリデーション（D2系・C4系・F系）とオプション絞り込みの両方がここから自動導出される。

```typescript
// 推奨値（選択肢に表示するがバリデーションなし）
{ kind: 'suggestion', field: 'transferReason',
  source: cl => cl.transferReasons.map(e => e.label) }

// 制約（選択肢 + リスト外はエラー）
{ kind: 'constraint', field: 'officialPositionCode',
  source: cl => cl.officialPositions.map(e => e.label),
  message: _ => '役職は有効な選択肢から選択してください' }

// 条件付き制約（when が true のとき source に絞る）
{ kind: 'constraint', field: 'band',
  when: (row, cl) => !!cl.employmentTypes.find(e => e.label === row.employmentType)?.isOutsourceAcceptance,
  source: cl => cl.jobLevels.filter(e => e.isOutsourceAcceptance).map(e => e.label),
  message: _ => 'バンドは雇用タイプに対応する選択肢から選択してください' }
```

**ルール追加時の自動伝播**:
- `validateDataExistence.ts` — `when` なし constraint → D2系として自動評価
- `validateCorrelation.ts` — `when` あり constraint → C/F系として自動評価
- `optionFilter/index.ts` — 全ルール → UI ドロップダウンの選択肢に自動反映

**W系（ワーニング）は FIELD_CONSTRAINTS に乗らない**。`validateGlobalConsistency.ts` にカスタム関数として実装し `level: 'warning'` で返す。

---

## STEP2 API 境界の規約

サーバー（`apps/server`）↔ クライアント（`apps/web`）間は JSON でやり取りするため、型安全が失われる境界。
以下のルールを破ると、TypeScript が通っても実行時クラッシュする。

### Drizzle ORM のキー命名

サーバーは PGlite（開発）/ Aurora PostgreSQL（本番）。DB アクセスはすべて Drizzle ORM。
Drizzle は TypeScript プロパティ名（camelCase）でキーを返す。**`ApiXxx` インターフェースも camelCase** で定義する。
これにより Drizzle の返却型と一致し、エイリアスなしで型安全に `c.json()` できる。

```typescript
// ✅ OK: Drizzle が camelCase で返す → ApiSubmission の camelCase と一致
const rows = await db.select().from(submissions)
// result: { roundCompanyId: '...', parentId: '...' }

// JOIN や computed field が必要なときだけ明示（camelCase で）
const rows = await db.select({
  id:           submissions.id,
  roundLabel:   rounds.label,
  assigneeName: users.name,
}).from(submissions).leftJoin(...)
```

詳細は `apps/server/CLAUDE.md` の「Drizzle ORM のキー命名規則」を参照。

### codeLists の受け取り方

サーバーが返す `codeLists` は `Record<string, unknown[]>` であり `AllCodeLists` 全フィールドを保証しない
（例: `orgMasterEntries` はサーバー側が除外して保存するため返却されない）。

**受け取り後は必ず `EMPTY_CODE_LISTS` とマージしてから `appService` に渡す**。

```typescript
import { EMPTY_CODE_LISTS, type AllCodeLists } from '@personnel/domain/masters/aggregate'

// ❌ NG（受け取った codeLists をそのまま cast → 未定義キーがあるとランタイムクラッシュ）
codeLists: masters.codeLists as AllCodeLists

// ✅ OK（EMPTY_CODE_LISTS をベースにして undefined キーを空配列で埋める）
codeLists: { ...EMPTY_CODE_LISTS, ...(masters.codeLists as Partial<AllCodeLists>) }
```

### ApiXxx インターフェースとクエリのフィールド同期

`ApiXxx` に新しいフィールドを追加したら、そのフィールドを返す**すべてのエンドポイント**のクエリにも追加する。
片方だけ変えると「型は通るが実行時は `undefined`」になる。

---

## やってはいけないこと

- `packages/domain/src/` 内で `appService` / `useStore` / React を import する
- `packages/domain/src/` 内で `apps/web/` や `apps/server/` のコードを import する
- `allocationList` を直接 `push` / `splice` する（必ず `executeOperation` 経由）
- `prevXxx` フィールドを操作中に書き換える（before 状態は不変）
- `positionCode` が `_pos_` 始まりかどうかチェックせず Excel 出力する
- `EditCommand` を使わず `HRApplicationService` に直接ドメインロジックを書く
- バリデーションとオプション絞り込みを別々に実装する（`FIELD_CONSTRAINTS` を使う）
- `ApiXxx` インターフェースを snake_case で定義する（Drizzle の返却型と不一致になる）
- サーバーから受け取った `codeLists` を `EMPTY_CODE_LISTS` とマージせず使う
- React の `map()` 内で `<>` フラグメントを key なしで使う（必ず `<React.Fragment key={...}>` を使う）
- キャンバスコンポーネントで `organizations.find(o => o.id === x)` を書く（Map を使う）
- キャンバスの `after/TreeWindow` / `before/BeforeTreeWindow` を直接コピーして新コンテキストを作る（`core/` の `OrgTreeNode` + `OrgTreePanel` を使って `renderItems` クロージャだけ差し替える）
- `togglePanelViewMode` を使う（廃止。`setPanelViewMode(mode)` を使う）
- パネル幅を `=== 'band' ? 208 : 288` とハードコードする（`VIEW_MODE_WIDTHS[panelViewMode]` を使う）
- `panelViewMode` の切り替えボタンをパネルヘッダーに置く（グローバル状態のコントロールはキャンバスヘッダー `OrgOperationView` に置く）

---

## 既知の未着手事項（docs/04-domain-model.md より）

- `FieldBinding` の分類は暫定。HR 運用ルールに合わせて要レビュー
- 削除済みパネル UI（削除済みポジション・人の復活操作）
- AI から位置操作（positionOps）を呼べるように `aiTools.ts` に未追加

---

## 業務フロー前提（仮説 / docs/04-domain-model.md 参照）

> 詳細・未決定事項は docs/04-domain-model.md を参照。

**重要な前提**:

- Excel は **before データのみ** で配布され、組織担当が after を記入して返却する
- Excel **A列**（ヘッダーなし）に担当者名（`assignee`）が入る。現在は読み飛ばしている列
- インポート直後は after が空 → そのままでは全員「未アサイン」になる
- `afterOrganizations` のコードは `beforeOrganizations` と **一部異なる**（廃止・分割・統合・改称）
- 旧組織 → 新組織の継承関係は Excel に存在しない。ツール内で対応づける必要がある

**2モードの設計**:

- **管理者モード**（取りまとめ担当）: 全行表示。担当者割り当てウィザード・分割エクスポート・マージ・上司名補完を使用
- **担当者モード**（組織担当）: 自分の `assignee` に一致する行のみ表示。新規行追加時は自動的に `assignee` が設定される

**スコープ概念の廃止**: `scopeOrgId` / `setScopeWithMapping` ベースのスコープは担当者（`assignee`）フィールドに置き換わる。詳細は `specs/G6-workflow/01-assignee-workflow.md` を参照。

---

## 実装仕様（specs/）

機能実装の仕様は `specs/` フォルダに記述する。Issueから実装する場合は必ず対応するspecを読んでから作業する。

| フォルダ/ファイル | 内容 | 主要ファイル |
|---|---|---|
| `specs/00-cross-cutting.md` | **変更種別ごとの横断的影響チェックリスト（実装時に必ず確認）** | — |
| `specs/G1-fields/` | フィールド定義・入力種別・codeList対応 | `01-field-definitions.md` |
| `specs/G2-domain/` | 業務ルール・バリデーション規則 | `01-business-rules.md`, `02-validation-rules.md`, `04-new-row-operations.md`, `05-operations-catalog.md` |
| `specs/G3-ui/` | UI入力補助・レビュー表示仕様 | `01-row-editor-input-spec.md`, `02-review-display-spec.md` |
| `specs/G4-ai/` | AI Tools設計・システムプロンプト | `01-tools-spec.md`, `02-system-prompt-rules.md` |
| `specs/G5-automation/` | GitHub Actions自動化ワークフロー | `01-github-actions-spec.md` |
| `specs/G6-workflow/` | **担当者ワークフロー（分割配布・マージ・上司名補完）** | `01-assignee-workflow.md` |
| `specs/G7-server/` | サーバー移行仕様（Phase 1 〜 3） | `01-api-spec.md`（未作成） |

### specを読んで実装するときの手順

1. `CLAUDE.md`（このファイル）を読む
2. 対象の spec ファイルを読む（G1 → G2 → G3 の順が依存関係に沿っている）
3. 実装する
   - ドメイン変更 → `packages/domain/src/` を編集
   - UI 変更 → `apps/web/src/` を編集
   - サーバー変更 → `apps/server/src/` を編集
4. 型チェック（該当 workspace で `npx tsc --noEmit`）
5. specファイルの実装状況（✗ → ✓）を更新する

### 未確認事項の扱い

spec内の `❓` マークは業務確認待ち。確認が取れる前に実装しない。
`TODO` は実装方針が決まっているが未着手のもの。
