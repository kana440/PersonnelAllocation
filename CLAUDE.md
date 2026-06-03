# CLAUDE.md — PersonnelAllocation プロジェクト

## コマンド

```bash
npm run dev        # 開発サーバー起動
npm run build      # 本番ビルド
npx tsc --noEmit   # 型チェック（テストの代わり）
npx depcruise src --config .dependency-cruiser.js  # アーキテクチャ境界チェック
```

---

## アーキテクチャ：依存の向きは外→内のみ

```
src/components/  src/store/      ← UI層（Reactコンポーネント + Zustand）
src/application/                 ← アプリケーション層
  importMerge.ts                 ←   インポートマージロジック
  setup/afterInit.ts             ←   初期化ロジック（Excel 読込後の org マッピング等）
src/infrastructure/              ← インフラ層（Excel・AI・LocalStorage）
src/domain/                      ← ドメイン層（外部依存ゼロ。Zodのみ可）
  allocationRow.ts               ← AllocationRow 型・FIELD_METADATA
  context.ts                     ← DomainContext・RowContext（全ドメイン処理の共通コンテキスト）
  masters/                       ← マスタデータ型定義・集約（AllCodeLists）
  validation/                    ← バリデーション A〜G・W 系（純粋関数）
    rules.ts                     ←   VALUE_RULES（許容値制約の単一定義ソース）
  commands/                      ← 業務操作（EditCommand・OperationDef・シナリオ）
    types.ts                     ←   EditCommand インターフェース・DomainContext 再エクスポート
    handlers/                    ←   EditCommand 実装群
    defs/                        ←   OperationDef 宣言群（メニュー条件・フォーム定義）
    scenarios.ts                 ←   複合操作（EditScenario）
    helpers.ts                   ←   isRegularEmployee 等の判定ヘルパー
  patterns/                      ← 変更パターン分類・検出
    editPatterns.ts              ←   EditPattern 定数（23種）
    editPatternMatcher.ts        ←   差分からの EditPattern 検出
    changeDetection.ts           ←   before/after 差分検出（RowChanges）
    groupPatternMatcher.ts       ←   グループ行（出向2行等）のパターン検出
  choices/                       ← UI選択肢・表示用ユーティリティ
    index.ts                     ←   選択肢の生成・絞り込み（VALUE_RULES から導出）
    orgTree.ts                   ←   組織ツリー操作（getDescendantOrgIds・flattenOrgTree）
    rows.ts                      ←   行・人物の表示用変換（buildOrgMap・derivePersons）
    relevantOrgs.ts              ←   組織ピッカー候補の絞り込み
  derivation/                    ← フィールド自動導出（組織・上司名・昇降格）
  csvImport/                     ← Excel/CSV 解釈（純粋関数）
src/ports/                       ← インターフェース定義
```

**絶対に守るルール**: `src/domain/` は `src/application/`・`src/components/` をインポートしない。

---

## 業務操作の追加方法（最重要）

操作フレームワークの設計思想は `docs/12-operation-framework.md` を参照。

### 概念の対応関係

| 名称 | コード上の実体 | 意味 |
|---|---|---|
| `EditCommand` | `src/domain/commands/types.ts` | 単行の原子操作。UndoStack 差分単位 |
| `EditScenario` | `src/domain/commands/scenarios.ts` | 複合操作。1件でも複数件でも同じ構造 |
| `EditPattern` | `src/domain/patterns/editPatterns.ts` | 操作の分類ラベル。表示・集計・メニュー用 |
| `OperationDef` | `src/domain/commands/defs/` | メニュー表示条件・フォーム定義・初期値計算 |

設計思想の詳細は `docs/12-operation-framework.md` を参照。

### 単一操作の追加

新しい業務変更は必ず `EditCommand` として実装する。直接 `allocationList` を変更しない。

```typescript
// src/domain/commands/handlers/myOp.ts
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
1. `EditPattern` に新ラベルを追加（`src/domain/patterns/editPatterns.ts`）
2. `EditCommand` の実装を追加（`src/domain/commands/handlers/`）
3. **バリデーションに検出条件を追加**（リストア保証の維持・必須）
4. `OperationDef` を追加（`src/domain/commands/defs/`）して `ALL_OPERATION_DEFS` に登録
5. 複数行にまたがる操作なら `EditScenario` を組み立てる（`commands/scenarios.ts`）

手順 3 を省略すると Excel 後方互換のリストア保証が崩れる。

既存の実装例: `src/domain/commands/handlers/positionOps.ts`（4種）, `directEdit.ts`, `moveRowsToOrg.ts`
TDD ガイド: `docs/13-tdd-operation-patterns.md`

---

## 中心データ型: AllocationRow

`src/domain/allocationRow.ts` が全フィールドを定義。Excel の 1 行 ≒ 1 レコード。

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

`src/application/UndoStack.ts` が差分管理（全スナップショットではなく変更行のみ保持）。

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

**`HRApplicationService`**（`src/application/`）が唯一の真の状態（Single Source of Truth）。

- `appService.executeOperation(op)` — Undo 対象の操作実行
- `appService.saveRow(rowId, changes)` — フィールド直接編集（`DirectEditOperation` に委譲）
- `appService.getSnapshot()` — `DomainSnapshot` を返す（Zustand はこれを subscribe）
- `appService.loadExcelData(data)` / `mergeExcelData(data)` — インポート

`useStore` / `useScopedStore` 経由で UI が subscribe する。**UI コンポーネントから `appService` を直接参照しない**（`OrgOperationView` など一部例外あり）。

**`canvasLayoutStore`**（`src/store/canvasLayoutStore.ts`）はキャンバスレイアウトの UI 状態（組織パネルの一覧・並び順）を管理する独立した Zustand ストア。`HRApplicationService` の Undo 対象外。Excel 読み込み時・セッションリセット時に自動クリアされる。

---

## AI ツール

`src/application/aiTools.ts` が AI から呼べる関数群。新しい操作を AI に公開するときはここに追加し、`HRApplicationService` の既存メソッドに委譲する。ロジックを重複して書かない。

**レビュー系ツール**（read-only）:
- `getReviewSummary()` — 変更種別ごとの件数 + バリデーション問題件数
- `getChangedPersons({ kinds? })` — 変更ありの人物リスト。変更種別でフィルタ可能
- `getValidationIssues({ level? })` — バリデーション問題の一覧。`error` / `warning` でフィルタ可能

シナリオは `src/infrastructure/ai/scenarios/`（9種）。レビュー系は `reviewSummary.ts`。

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

**OrgTreePanel パターン**: レビューエリアで検索＋組織ツリーを使うときは
`src/components/review/components/OrgTreePanel.tsx` を再利用する。
コピーしてローカルに書かない。

**OrgPickerModal パターン**: 組織をモーダルで選択させるときは
`src/components/common/OrgPickerModal` を使う。階層ツリー表示・検索・追加済み表示を統一提供する。
インラインのドロップダウンで代替しない。

**左サイドバー構造**:
```
LeftSidebar（タブ）
  ├── 組織・人物タブ → OrgSearchSidebar（組織ツリー・人物一覧）
  └── 組織パネルタブ → PanelTabContent（パネル一覧・未網羅候補・未設定）
```
- 担当者ロール（`capabilities.rowScope !== null`）: 組織パネルタブがデフォルト
- 管理者ロール（`capabilities.rowScope === null`）: 組織・人物タブがデフォルト
- 組織パネルの状態は `canvasLayoutStore` が管理し、Excel 読み込み時にリセットされる

---

## 値制約・選択肢の追加方法（VALUE_RULES）

`src/domain/valueRules.ts` がフィールドの許容値制約の**単一定義ソース**。
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
// when は (row, codeLists) => boolean
// source は (codeLists, row?) => string[]
{ kind: 'constraint', field: 'band',
  when: (row, cl) => !!cl.employmentTypes.find(e => e.label === row.employmentType)?.isOutsourceAcceptance,
  source: cl => cl.jobLevels.filter(e => e.isOutsourceAcceptance).map(e => e.label),
  message: _ => 'バンドは雇用タイプに対応する選択肢から選択してください' }
```

**ルール追加時の自動伝播**:
- `validateExistence.ts` — `when` なし constraint → D2系として自動評価
- `validateRelated.ts` — `when` あり constraint → C/F系として自動評価
- `optionFilter/index.ts` — 全ルール → UI ドロップダウンの選択肢に自動反映

**W系（ワーニング）は VALUE_RULES に乗らない**。`validateConsistency.ts` にカスタム関数として実装し `level: 'warning'` で返す。

---

## やってはいけないこと

- `src/domain/` 内で `appService` / `useStore` / React を import する
- `allocationList` を直接 `push` / `splice` する（必ず `executeOperation` 経由）
- `prevXxx` フィールドを操作中に書き換える（before 状態は不変）
- `positionCode` が `_pos_` 始まりかどうかチェックせず Excel 出力する
- `EditCommand` を使わず `HRApplicationService` に直接ドメインロジックを書く
- バリデーションとオプション絞り込みを別々に実装する（`VALUE_RULES` を使う）

---

## 既知の未着手事項（docs/09-position-person-domain.md より）

- `FieldBinding` の分類は暫定。HR 運用ルールに合わせて要レビュー
- 削除済みパネル UI（削除済みポジション・人の復活操作）
- AI から位置操作（positionOps）を呼べるように `aiTools.ts` に未追加

---

## 業務フロー前提（仮説 / docs/10-business-flow-hypothesis.md 参照）

> 詳細・未決定事項は docs/10-business-flow-hypothesis.md を参照。

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

**これが意味すること（実装上の注意）**:

- after の初期化は「before をそのままコピー」では不可。**組織継承マッピング**を経由する必要がある
- 上司ポジション欄は組織担当が氏名フリーテキストで記入 → マージ後に取りまとめ担当が `managerPositionCode` を補完する

---

## 実装仕様（specs/）

機能実装の仕様は `specs/` フォルダに記述する。Issueから実装する場合は必ず対応するspecを読んでから作業する。

| フォルダ/ファイル | 内容 | 主要ファイル |
|---|---|---|
| `specs/00-cross-cutting.md` | **変更種別ごとの横断的影響チェックリスト（実装時に必ず確認）** | — |
| `specs/G1-fields/` | フィールド定義・入力種別・codeList対応 | `01-field-definitions.md` |
| `specs/G2-domain/` | 業務ルール・バリデーション規則 | `01-business-rules.md`, `02-validation-rules.md` |
| `specs/G3-ui/` | UI入力補助・レビュー表示仕様 | `01-row-editor-input-spec.md`, `02-review-display-spec.md` |
| `specs/G4-ai/` | AI Tools設計・システムプロンプト | `01-tools-spec.md`, `02-system-prompt-rules.md` |
| `specs/G5-automation/` | GitHub Actions自動化ワークフロー | `01-github-actions-spec.md` |
| `specs/G6-workflow/` | **担当者ワークフロー（分割配布・マージ・上司名補完）** | `01-assignee-workflow.md` |

### specを読んで実装するときの手順

1. `CLAUDE.md`（このファイル）を読む
2. 対象の spec ファイルを読む（G1 → G2 → G3 の順が依存関係に沿っている）
3. 実装する
4. `npx tsc --noEmit` で型チェック
5. specファイルの実装状況（✗ → ✓）を更新する

### 未確認事項の扱い

spec内の `❓` マークは業務確認待ち。確認が取れる前に実装しない。
`TODO` は実装方針が決まっているが未着手のもの。
