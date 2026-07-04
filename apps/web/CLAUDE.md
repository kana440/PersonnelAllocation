# CLAUDE.md — apps/web

React + Vite フロントエンド。ドメインロジックは `@personnel/domain` から import する。

## コマンド

```bash
npm run dev          # 開発サーバー（http://localhost:5173）
npm run build        # 本番ビルド
npx tsc --noEmit     # 型チェック
npx vitest run       # テスト実行
```

## 環境変数

STEP1 と STEP2 は画面動線が根本的に異なる別シェル。**2変数**で制御する：

| `VITE_APP_MODE` | `VITE_AUTH_MODE` | 用途 | バックエンド | 認証 |
|---|---|---|---|---|
| `step1`（デフォルト） | `none` | STEP1 本番・Excel ローカル運用 | なし | なし |
| `step2` | `stub` | STEP2 DEV | ローカル Hono + SQLite | スタブ（ユーザー切り替え UI） |
| `step2` | `sso` | STEP2 ステージング/本番 | Aurora | SAML SSO |

- `.env.local` に `VITE_APP_MODE=step2` + `VITE_AUTH_MODE=stub` → STEP2 DEV（`npm run dev:server` と併用）
- `.env.production` は `VITE_APP_MODE=step1` 固定（STEP1 本番ビルド用）
- STEP2 本番デプロイ時は CI/CD 環境変数で `VITE_APP_MODE=step2` + `VITE_AUTH_MODE=sso` を指定する

機能フラグは `src/config/features.ts` の `Features` オブジェクトで参照する。
UI コンポーネントで直接 `import.meta.env` を読まない。

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

### 再利用すべき共通コンポーネント

**OrgTreePanel**: レビューエリアで検索＋組織ツリーを使うとき →
`src/components/review/components/OrgTreePanel.tsx` を再利用。コピーしてローカルに書かない。

**OrgPickerModal**: 組織をモーダルで選択させるとき →
`src/components/common/OrgPickerModal` を使う。インラインのドロップダウンで代替しない。

---

## 状態管理

- **`HRApplicationService`**（`src/application/`）が唯一の真の状態。
- `useStore` / `useScopedStore` 経由で UI が subscribe する。
- **UI コンポーネントから `appService` を直接参照しない**（一部例外あり）。
- **`canvasLayoutStore`**（`src/store/canvasLayoutStore.ts`）はキャンバスレイアウトの UI 状態を管理する独立した Zustand ストア。`HRApplicationService` の Undo 対象外。

### Zustand ストア購読パターン

セレクタなしの `useStore()` / `useCanvasLayoutStore()` は、ストア内の任意の値変化で再レンダーを引き起こす。キャンバスコンポーネントは 2000 インスタンスになるため致命的。

```typescript
// ❌ NG: ストア全体を subscribe → canvasZoom / panelHeights の毎フレーム更新で全インスタンスが再レンダー
const { panels, setOrgOpen } = useCanvasLayoutStore()
const { masters } = useStore()

// ✅ OK: 複数フィールド → useShallow
const { panels, setOrgOpen } = useCanvasLayoutStore(useShallow(s => ({
  panels:    s.panels,
  setOrgOpen: s.setOrgOpen,
})))

// ✅ OK: 単一フィールド → セレクタ関数
const masters = useStore(s => s.masters)

// ✅ OK: イベントハンドラ内のみ（render に不要）→ getState()
//   canvasZoom はドラッグ計算にのみ必要 → subscribe せず都度読む
const z = useCanvasLayoutStore.getState().canvasZoom
```

### 操作の呼び出し方（UI から）

```typescript
// 単一操作（Undo 対象）
appService.executeOperation(new MyOperation(rowId))

// 複合操作（玉突き等）
appService.executeScenario({ label: '部長交代', commands: [cmdA, cmdB, cmdC] })
```

---

## 左ナビゲーション構造

```
OrgPersonNav（layout/OrgPersonNav/）
  ├── 検索・フィルタバー（NavMode: 'all' | 'changes' | 'issues'）
  ├── OrgSection × N → PersonRow × N
  └── 比較モード時も同一コンポーネントを使用（after 側のナビとして機能）
```

- `UnassignedCard`（departmentCode 未設定）と `UnmappedOrgSection`（新組織マスタに存在しない旧組織）は別物

---

## テスト

テストは `tests/` フォルダ。ヘルパーは `tests/helpers/` を使う。

- `fixtures.ts` — `makeRow` / `makePosRow` / `makePersonRow` / `makeCL` / `MOCK_ORGS`
- `runner.ts` — `runScenarios`（バリデーションシナリオ用）
- `operationRunner.ts` — `runOperationScenarios`（OperationDef 用）
