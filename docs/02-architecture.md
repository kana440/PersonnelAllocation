# アーキテクチャ設計

## クリーンアーキテクチャ概観

依存の向きは**外側 → 内側のみ**。ドメイン層は何にも依存しない。

物理配置は**モノレポ**（`apps/web/`, `apps/server/`, `packages/domain/`）に分離されているが、
論理的な依存の向きはクリーンアーキテクチャの層構造に従う。

```
┌──────────────────────────────────────────────────────────────────┐
│ UI 層         apps/web/src/components/  apps/web/src/store/      │
│  React コンポーネント + Zustand ストア                           │
│  ・状態は useStore 経由でのみ参照                                │
│  ・ドメインロジックを直接書かない                                │
├──────────────────────────────────────────────────────────────────┤
│ アプリケーション層  apps/web/src/application/                    │
│  HRApplicationService   — Single Source of Truth                │
│  aiTools.ts             — AI 向け Tool 関数群                   │
│  chatSession.ts         — LLM チャットセッション管理             │
├──────────────────────────────────────────────────────────────────┤
│ ドメイン層    packages/domain/src/     ← 依存ゼロ・テスト最優先 │
│  （apps/web・apps/server 双方が @personnel/domain として参照）   │
│  allocationRow.ts    — AllocationRow 型, FIELD_METADATA          │
│  schemas.ts          — Zod スキーマ（Organization, Person …）   │
│  context.ts          — DomainContext・RowContext（共通コンテキスト）│
│  commands/           — EditCommand・OperationDef・EditScenario   │
│  patterns/           — EditPattern 分類・差分検出               │
│  validation/         — バリデーション A〜W 系（純粋関数）        │
│  choices/            — 選択肢生成・組織ツリー操作               │
│  masters/            — マスタデータ型定義・AllCodeLists 集約     │
│  derivation/         — フィールド自動導出（純粋関数）            │
│  csvImport/          — Excel/CSV 解釈（純粋関数）               │
├──────────────────────────────────────────────────────────────────┤
│ インフラ層    apps/web/src/infrastructure/  （将来: apps/server）│
│  excel/exceljs/exporter.ts  — Excel エクスポート（ExcelJS）     │
│  excel/xlsx/exporter.ts     — Excel エクスポート（xlsx）        │
│  excel/engine.ts            — エクスポーター選択                │
│  excel/state.ts             — 元ファイルバッファ保持             │
│  allocationListMapper.ts    — ドメイン→Excel 行変換             │
│  masters/                   — LocalStorage 実装                 │
│  ai/agentRunner.ts          — Claude API Tool Use ループ        │
│  ai/mockChatService.ts      — AI チャットモック                 │
│  ai/scenarios/              — 会話シナリオ（8種）               │
│                                                                  │
│  apps/server/src/  （STEP2 デモ用バックエンド）                  │
│  db/database.ts     — DB エントリポイント（PGlite/Aurora 切替） │
│  db/schema.ts       — Drizzle スキーマ定義（pgTable）           │
│  db/adapters/       — PGlite（dev）/ Aurora（prod）             │
│  routes/            — Hono REST API（Drizzle ORM、全 async）    │
│  auth/stub.ts       — 認証スタブ（将来: SSO アダプタに差替）    │
├──────────────────────────────────────────────────────────────────┤
│ ポート        apps/web/src/ports/                                │
│  IAllocationDataSource — データ読み込み抽象                      │
│  IAllocationExporter   — データ書き出し抽象                     │
│  ICodeListSource       — コードリスト読み込み抽象                │
│  IAIChatService        — AI チャット抽象                        │
│  INotificationPort     — 通知抽象（将来実装）                   │
│  IAuthPort             — 認証抽象（将来実装）                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## データフロー

```
Excel ファイル
    │
    ▼
[Infrastructure]  excelImport.ts / excel/engine.ts
    │              AllocationRow[] + Organization[] + AllCodeLists を生成
    ▼
[Application]     HRApplicationService.loadExcelData()
    │              コアデータをメモリに格納
    ▼
[Store]           useStore.ts (Zustand)
    │              DomainSnapshot を UI に公開
    ├─────────────────────┬────────────────────────
    ▼                     ▼
[Web UI]              [AI アシスタント]
 OrgOperationView       AIChatDrawer + useChatHandlers
 RowEditorPanel         → aiTools.ts → scenarios/
    │                     │
    └──────────┬───────────┘
               ▼
[Application]  HRApplicationService.executeScenario(s)     ← EditScenario 経由（統一口）
               HRApplicationService.executeOperation(op)   ← EditCommand 経由（後方互換ラッパー）
               │
               ├─ cmd.validate(ctx) ← 純粋関数（副作用なし）
               ├─ UndoStack.push()  ← StatePatch として差分を積む
               ├─ cmd.apply(ctx)    ← 純粋関数（副作用なし）
               └─ emit()            ← Zustand 再同期
               │
               ▼
[Infrastructure]  excel/engine.ts
    │              allocationList → Excel（要員配置リストシートを上書き）
    ▼
Excel ファイル
```

**設計の核心**:
Web UI も AI も `executeScenario()` / `executeOperation()` を通る。
操作フレームワークの設計思想は `docs/05-operation-framework.md` を参照。

---

## ドメインモデル：ポジション・人・配属

`docs/04-domain-model.md` に詳細を記載。概要:

| エンティティ | キー | 説明 |
|---|---|---|
| **ポジション** | `positionCode` | 組織の「席」。人がいなくても存在できる |
| **人（メンバー）** | `userId`（= groupEmployeeId） | 従業員。ポジションなしでも組織に属せる |
| **配属** | — | ポジションと人の 1:1 紐付け |

`AllocationRow` の 1行はこの3エンティティを合体した Excel 行。
`FieldBinding`（`position / person / both / allocation / meta`）で各フィールドの帰属を管理する。

---

## 操作の抽象化（EditCommand / EditScenario）

詳細は `docs/05-operation-framework.md` を参照。概要:

```typescript
// EditCommand — 単行の原子操作（旧 IDomainOperation）
interface EditCommand {
  readonly kind: string         // EditPattern 分類ラベル
  validate(ctx: DomainContext): ValidationResult   // 純粋関数
  apply(ctx: DomainContext): OperationResult       // 純粋関数
}

// EditScenario — 複合操作（玉突き人事など）
interface EditScenario {
  readonly label: string
  readonly commands: EditCommand[]   // 1件でも複数件でも同じ構造
}
```

### なぜ純粋関数なのか

1. **テスト容易性**: 外部依存なし。任意の AllocationRow[] を渡してテストできる
2. **予測可能性**: 同じ入力には必ず同じ出力
3. **Undo の単純さ**: apply が副作用を持たないため、Undo は差分スタックの巻き戻しで実現できる

---

## 状態管理の詳細

### HRApplicationService（真の状態）

```
private allocationList:      AllocationRow[]   ← 唯一の真の状態
private beforeOrganizations: Organization[]
private afterOrganizations:  Organization[]
private companies:           Company[]
private codeLists:           AllCodeLists
private past:                CoreState[]        ← Undo スタック
private future:              CoreState[]        ← Redo スタック
private cachedPersons:       Person[] | null    ← derivePersons キャッシュ（emit でクリア）
private assigneeMode:        { kind: 'admin' } | { kind: 'assignee'; name: string }  ← モード（将来追加）
```

### DomainSnapshot（派生・再計算）

```
persons:             Person[]           ← allocationList から userId を dedupe（キャッシュあり）
canUndo:             boolean
canRedo:             boolean
organizations:       Organization[]    ← beforeOrganizations の後方互換エイリアス
assignees:           string[]          ← allocationList の assignee 値をユニーク化（将来追加）
```

> **注**: `Position` / `Affiliation` の派生ビューは廃止済み。
> コンポーネントは `allocationList` + `useMemo` で構築した Map を直接参照する。
> ポジションツリーは `OrgOperationView` の `positionTreeByOrgId` useMemo で O(n) 構築。

### Undo の仕組み

```
checkpoint() → past.push(coreSnapshot())  // 5つのコアデータを複製して積む
undo()       → past.pop()                 // 前の状態に戻す
redo()       → future.pop()
```

ポジション操作（createVacantPosition 等）は `executeOperation()` 経由で Undo 対象。

---

## AI アーキテクチャ

```
AIChatDrawer
    │
    ├─ useChatHandlers      ← シナリオのオーケストレーション
    │       │
    │       ├─ scenarios/   ← 会話シナリオ（8種: import / orgMembers / dept / reportLine /
    │       │                               promote / impact / export / excelHelp）
    │       └─ aiTools.ts   ← HRApplicationService への読み取り・操作インターフェース
    │
    ├─ agentRunner.ts       ← Claude API Tool Use ループ（本番接続）
    └─ mockChatService.ts   ← モック（Claude API なし環境用）
```

シナリオは「フェーズ管理（ChatPhase）＋ウィジェット表示」のパターンで実装。
自由テキスト入力は agentRunner（Claude API Tool Use）または chatSession（通常チャット）が処理する。

---

## SuccessFactors 連携（将来）

ポートを介しているため、アダプターを差し替えるだけで連携できる。

```
現在（Excel）                           将来（SuccessFactors）
──────────────────────────────         ────────────────────────────────
infrastructure/excelImport.ts          src/adapters/salesforce/SFDataSource.ts
  概念的に IAllocationDataSource         implements IAllocationDataSource

infrastructure/excel/engine.ts         src/adapters/salesforce/SFExporter.ts
  概念的に IAllocationExporter            implements IAllocationExporter

現在（モック + Tool Use）              将来（本番 Claude API）
──────────────────────────────         ────────────────────────────────
ai/mockChatService.ts                  ai/agentRunner.ts (Tool Use) ← 実装済み
  implements IAIChatService
```

---

## STEP1 / STEP2 共存アーキテクチャ

### 2シェル構成

STEP1 と STEP2 は画面動線が根本的に異なるため、**別のアプリシェル**として実装する。共通コアは共有しつつ、エントリポイントを分ける。

```
STEP1 Shell（VITE_APP_MODE=step1）     STEP2 Shell（VITE_APP_MODE=step2）
──────────────────────────────         ────────────────────────────────────
main.tsx → App.tsx（step1用）          main.tsx → App.tsx（step2用）

ファイル選択画面                        SSO ログイン画面
  ↓                                       ↓
モード選択（管理者 / 担当者）           ポータル（依頼一覧）
  ↓                                       ↓
EditView（共通コア）   ←─────────────── EditView（共通コア）
  ↓                                       ↓
Excel エクスポート                      Round 提出（Submission 完了）
```

### EditView のスロットパターン

`EditView` は「共通コア」＋「3つのスロット」で構成する。スロットを使い分けることで、STEP1/STEP2 の機能差異を局所化する。

```typescript
interface EditViewSlots {
  // ユーザー情報エリア: STEP1=モードセレクタ、STEP2=SSO ユーザー表示
  userSlot?: ReactNode
  // 主アクションボタン: STEP1=Excel エクスポート、STEP2=提出ボタン
  primaryActionSlot?: ReactNode
  // STEP2 専用追加エリア: 提出状況・コメント・照会機能など
  step2ExtrasSlot?: ReactNode
}

// 使い方
<EditView
  userSlot={isStep2 ? <SSOUserBadge /> : <ModeSelector />}
  primaryActionSlot={isStep2 ? <SubmitButton /> : <ExcelExportButton />}
  step2ExtrasSlot={isStep2 ? <SubmissionProgress /> : null}
/>
```

**スロット設計の原則**:
- Core（共通コア）への追加は STEP1・STEP2 どちらにも自動で反映される
- STEP2 専用機能のみ `step2ExtrasSlot` に配置する
- STEP1 に新しいボタン・機能を追加する際に STEP2 側を手動更新する必要はない

### 環境変数（2変数制御）

```
VITE_APP_MODE   step1 | step2        どのアプリシェルを使うか
VITE_AUTH_MODE  none | stub | sso    認証方式（STEP2 のみ有効）
```

組み合わせ:

| `VITE_APP_MODE` | `VITE_AUTH_MODE` | 用途 |
|---|---|---|
| `step1` | `none` | STEP1 本番（デフォルト）|
| `step2` | `stub` | STEP2 DEV（Hono + SQLite）|
| `step2` | `sso` | STEP2 本番（Aurora + SAML）|

機能フラグは `src/config/features.ts` の `Features` オブジェクトで参照する。
UI コンポーネントで直接 `import.meta.env` を読まない。

### STEP2 の API クライアント

STEP2 の認証・Round / Submission 操作は `apps/web/src/infrastructure/api/` に実装済み。

```
apps/web/src/infrastructure/api/
  authApi.ts        — SSO / スタブ認証（ログイン・ユーザー取得）
  adminApi.ts       — Round・Submission・管理操作（サーバー API 呼び出し）
```

将来 SSO を本番接続する際は `authApi.ts` のアダプタを差し替える（`VITE_AUTH_MODE=sso`）。

DEV 環境では Hono + SQLite アダプタ、本番では Aurora アダプタを `serviceFactory.ts`（実装予定）で組み替える。
