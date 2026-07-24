# アーキテクチャ設計

## クリーンアーキテクチャ概観

依存の向きは**外側 → 内側のみ**。ドメイン層（`packages/domain/src/`）は何にも依存しない。
物理配置はモノレポ（`apps/web/`, `apps/server/`, `packages/domain/`）だが、論理的な依存の向きはクリーンアーキテクチャの層構造に従う。

各層の正確なサブディレクトリ構成（`rules/validate`・`rules/options`・`rules/derive` 等）はルート `CLAUDE.md` の「モノレポ構成」節が正である。ここでは層の役割のみを示す。

```
UI 層           apps/web/src/components/, apps/web/src/store/
                 React + Zustand。ドメインロジックを直接書かない。useStore 経由でのみ状態参照

アプリケーション層  apps/web/src/application/
                 HRApplicationService（Single Source of Truth）, aiTools/, UndoStack

ドメイン層       packages/domain/src/   ← 依存ゼロ・テスト最優先
                 apps/web・apps/server 双方が @personnel/domain として参照
                 allocationRow.ts / context.ts / masters/ / rules/ / commands/ / patterns/ / csvImport/

インフラ層       apps/web/src/infrastructure/
                 excel/engine.ts        — インポート: ExcelJS、エクスポート: JSZip による外科的 XML 書き換え
                 ai/                     — agentRunner.ts（Tool Use ループ）, toolRegistry/, skills/
                 masters/, contact/, api/ — LocalStorage 実装・連絡票・STEP2 API クライアント

                 apps/server/src/  （STEP2 デモ用バックエンド）
                 db/database.ts + db/adapters/{pglite,aurora}.ts、db/schema.ts（Drizzle）
                 routes/{auth,rounds,submissions,ai,domain}.ts + routes/admin/
                 auth/stub.ts — 認証スタブ（将来: SSO アダプタに差替）

ポート          apps/web/src/ports/
                 IAllocationDataSource / IAllocationExporter / ICodeListSource / IAIChatService 等
```

---

## データフロー

```
Excel ファイル
    │
    ▼
[Infrastructure]  excel/engine.ts（ExcelJS でインポート）
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
 OrgOperationView       FloatingAIChat → aiTools/
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
[Infrastructure]  excel/engine.ts（JSZip で外科的書き換え。元ファイルの書式・マクロを保持）
    │              allocationList → Excel（要員配置リストシートを上書き）
    ▼
Excel ファイル
```

**設計の核心**: Web UI も AI も `executeScenario()` / `executeOperation()` を通る。操作フレームワークの設計思想は `docs/05-operation-framework.md` を参照。

---

## ドメインモデル：ポジション・人・配属

`docs/04-domain-model.md` に詳細を記載。概要:

| エンティティ | キー | 説明 |
|---|---|---|
| **ポジション** | `positionCode` | 組織の「席」。人がいなくても存在できる |
| **人（メンバー）** | `userId`（= groupEmployeeId） | 従業員。ポジションなしでも組織に属せる |
| **配属** | — | ポジションと人の 1:1 紐付け |

`AllocationRow` の 1行はこの3エンティティを合体した Excel 行。`FieldBinding`（`position / person / both / allocation / meta`）で各フィールドの帰属を管理する。

---

## 操作の抽象化（EditCommand / EditScenario）

`EditCommand`（単行の原子操作）・`EditScenario`（複合操作）のインターフェースと追加手順はルート `CLAUDE.md`「業務操作の追加方法」節、設計思想の詳細は `docs/05-operation-framework.md` を参照。

**なぜ純粋関数（`validate`/`apply` に副作用なし）なのか**:
1. **テスト容易性**: 外部依存なし。任意の `AllocationRow[]` を渡してテストできる
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
```

### DomainSnapshot（派生・再計算）

```
persons:             Person[]           ← allocationList から userId を dedupe（キャッシュあり）
canUndo / canRedo:   boolean
organizations:       Organization[]    ← beforeOrganizations の後方互換エイリアス
```

> **注**: `Position` / `Affiliation` の派生ビューは廃止済み。コンポーネントは `allocationList` + `useMemo` で構築した Map を直接参照する。ポジションツリーは `OrgOperationView` の `positionTreeByOrgId` useMemo で O(n) 構築。

### Undo の仕組み

```
checkpoint() → past.push(coreSnapshot())  // コアデータを複製して積む
undo()       → past.pop()                 // 前の状態に戻す
redo()       → future.pop()
```

実体は `UndoStack.ts`（差分ベース、全スナップショットではなく変更行のみ保持、`MAX_UNDO=50`）。ポジション操作（`createVacantPosition` 等）も `executeOperation()` 経由で Undo 対象。

---

## AI アーキテクチャ

```
FloatingAIChat（フローティングウィジェット・ドラッグ可能）
    │
    ├─ agentRunner.ts        ← Claude API Tool Use ループ（本番接続）
    │       └─ infrastructure/ai/toolRegistry/  ← ToolEntry 定義（read/render/navigate/execute/confirm）
    │              └─ application/aiTools/      ← HRApplicationService への読み取り・操作インターフェース
    │
    └─ mockChatService.ts    ← モック（Claude API なし環境用）
```

ツール種別（`read`/`render`/`navigate`/`execute`/`confirm`）・Fast Path・命名規約はルート `CLAUDE.md`「AI ツール」節を参照。

---

## SuccessFactors 連携（将来）

ポートを介しているため、アダプターを差し替えるだけで連携できる想定。

```
現在（Excel）                            将来（SuccessFactors）
infrastructure/excel/engine.ts          adapters/salesforce/{SFDataSource,SFExporter}.ts
  概念的に IAllocationDataSource/IAllocationExporter を実装

現在（モック + Tool Use）               将来（本番 Claude API）
ai/mockChatService.ts                   ai/agentRunner.ts (Tool Use) ← 実装済み
```

---

## STEP1 / STEP2 共存アーキテクチャ

STEP1（Excel ローカル運用）と STEP2（サーバー・SSO・Round 管理）は画面動線が根本的に異なるため、**別のアプリシェル**として実装する。共通コアのみ共有する。

```
STEP1 Shell（VITE_APP_MODE=step1）     STEP2 Shell（VITE_APP_MODE=step2）
main.tsx → App.tsx（step1用）          main.tsx → Step2App.tsx（step2用）
ファイル選択画面                        SSO ログイン画面
  ↓                                       ↓
モード選択（管理者 / 担当者）           ポータル（依頼一覧）
  ↓                                       ↓
EditViewCore（共通コア）  ←───────────── EditViewCore（共通コア）
  ↓                                       ↓
Excel エクスポート                      Round 提出（Submission 完了）
```

`EditViewCore` は共通骨格を 4 スロット（`headerLeft` / `headerMid?` / `headerRight` / `topBanner?`）で差し替える設計。スロット定義・使い分けはルート `CLAUDE.md`「EditViewCore スロットパターン」節を参照（正）。AI チャットは `EditViewCore` の外側に浮くフローティングウィジェット（`FloatingAIChat`）であり、スロットの対象外。

### 環境変数（2変数制御）

```
VITE_APP_MODE   step1 | step2        どのアプリシェルを使うか
VITE_AUTH_MODE  none | stub | sso    認証方式（STEP2 のみ有効）
```

| `VITE_APP_MODE` | `VITE_AUTH_MODE` | 用途 |
|---|---|---|
| `step1` | `none` | STEP1 本番（デフォルト）|
| `step2` | `stub` | STEP2 DEV（Hono + PGlite）|
| `step2` | `sso` | STEP2 本番（Aurora + SAML）|

機能フラグは `src/config/features.ts` の `Features` オブジェクトで参照する。UI コンポーネントで直接 `import.meta.env` を読まない。

STEP2 の認証・Round / Submission 操作は `apps/web/src/infrastructure/api/`（`authApi.ts` / `adminApi.ts`）に実装済み。将来 SSO を本番接続する際は `authApi.ts` のアダプタを差し替える（`VITE_AUTH_MODE=sso`）。

---

## モジュール構成と依存関係

各モジュールは独立してビルド・テスト可能になるよう設計している（依存は矢印の向き、→ = 依存する）。

```
Module A: Core Types（allocationRow.ts, masters/, csvImport/）
    ↑
Module B: Validation & Options（rules/validate/, rules/options/, rules/field.ts, fieldConstraints.ts）
    ↑
Module C: Operation Abstraction（commands/, patterns/）
    ↑
Module D: Projection（rules/options/rows.ts — buildOrgMap / derivePersons）
    ↑
Module F: Application Service（apps/web/src/application/HRApplicationService.ts）
    ↑               ↑
Module G: AI Tools  Module H: Excel Adapter（infrastructure/excel/）
    ↑
Module I: Web UI + State（components/, store/useStore.ts）

Module J: Code List Storage（infrastructure/masters/）  ← Module A のみに依存
Module K: SF Adapter（将来） ← ports/ のみに依存
```

Module E（旧称 Pattern Detection のインターフェース専用モジュール）という区分は廃止。パターン検出は `patterns/defs/`・`patterns/detection/`・グループ検出は `patterns/group/` + `groupPatternMatcher.ts` として実装済み（Module C に統合済み）。

### モジュール別の公開 API（抜粋）

| モジュール | 公開 API（代表例） |
|---|---|
| **A: Core Types** | `AllocationRow`, `FIELD_METADATA`, `fieldsByBinding(b)`, `rowDiff()`, `nextRowId()`, `copyBeforeToAfter()` |
| **B: Validation & Options** | `validateRow(ctx)`, `issuesForField()`, `buildBaseOptions()`, `filterOptions()`, `getFieldOptions()` |
| **C: Operation Abstraction** | `EditCommand`（`validate`/`apply`）, `EditScenario`, `EditPattern`, `ok()`/`fail()`/`failField()` |
| **D: Projection** | `buildOrgMap(orgs)`, `derivePersons(rows)`, `deriveCompanies(orgs, companies)` |
| **F: Application Service** | `executeScenario()`, `executeOperation()`, `saveRow()`, `undo()`/`redo()`, `getSnapshot()`, `subscribe()` |
| **G: AI Tools** | `createAITools(service)` → `findPersons`/`findVacantPositions`/`getRow`/`validateOperation`/`executeOperation`（`application/aiTools/` 参照） |
| **H: Excel Adapter** | `importFromFile/Url`, `exportToXlsx`, `buildExportBuffer`（`positionCode` の `_pos_` prefix → blank 出力ルールに注意） |

**テスト方針**: A・B・C・D は外部依存ゼロの純粋関数群のため単体テストで直接検証できる。F はクラスなのでインスタンス化して操作、H はファイル I/O を含むためインテグレーションテスト、I は E2E（Playwright 等）または RTL。

### 疎結合の確認チェックリスト

- [ ] ドメイン層（`commands/`, `rules/`, `masters/`）は外部ライブラリに依存していないか
- [ ] 操作ハンドラーの `validate()` と `apply()` は純粋関数か（副作用なし・同じ入力 → 同じ出力）
- [ ] AI と Web UI は同じ `executeOperation()` / `executeScenario()` を通っているか
- [ ] AI から呼ぶ操作は `application/aiTools/` に公開されているか
- [ ] 新しいデータソース（SF 等）は `IAllocationDataSource` を実装しているか
- [ ] 単体テストが外部サービスなしで書けるか
