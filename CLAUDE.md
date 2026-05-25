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
src/infrastructure/              ← インフラ層（Excel・AI・LocalStorage）
src/domain/                      ← ドメイン層（外部依存ゼロ。Zodのみ可）
src/ports/                       ← インターフェース定義
```

**絶対に守るルール**: `src/domain/` は `src/application/`・`src/components/` をインポートしない。

---

## 業務操作の追加方法（最重要）

新しい業務変更は必ず `IDomainOperation` として実装する。直接 `allocationList` を変更しない。

```typescript
// src/domain/operation/handlers/myOp.ts
export class MyOperation implements IDomainOperation {
  readonly kind = 'MyOperation'
  constructor(private readonly rowId: number) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return { ok: false, message: '対象行が見つかりません' }
    return { ok: true }
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
// 呼び出し側（UI or AI）
appService.executeOperation(new MyOperation(rowId))
// → validate → UndoStack に積む → apply → emit（Zustand 再同期）
```

既存の実装例: `src/domain/operation/handlers/positionOps.ts`（4種）, `directEdit.ts`, `moveRowsToOrg.ts`

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

---

## やってはいけないこと

- `src/domain/` 内で `appService` / `useStore` / React を import する
- `allocationList` を直接 `push` / `splice` する（必ず `executeOperation` 経由）
- `prevXxx` フィールドを操作中に書き換える（before 状態は不変）
- `positionCode` が `_pos_` 始まりかどうかチェックせず Excel 出力する
- `IDomainOperation` を使わず `HRApplicationService` に直接ドメインロジックを書く

---

## 既知の未着手事項（docs/09-position-person-domain.md より）

- `FieldBinding` の分類は暫定。HR 運用ルールに合わせて要レビュー
- 削除済みパネル UI（削除済みポジション・人の復活操作）
- AI から位置操作（positionOps）を呼べるように `aiTools.ts` に未追加

---

## 業務フロー前提（仮説 / docs/10-business-flow-hypothesis.md 参照）

> 詳細・未決定事項は docs/10-business-flow-hypothesis.md を参照。

**重要な前提（仮説）**:

- Excel は **before データのみ** で配布され、担当者が after を記入して返却する
- インポート直後は after が空 → そのままでは全員「未アサイン」になる
- `afterOrganizations` のコードは `beforeOrganizations` と **一部異なる**（廃止・分割・統合・改称）
- 旧組織 → 新組織の継承関係は Excel に存在しない。ツール内で対応づける必要がある

**これが意味すること（実装上の注意）**:

- after の初期化は「before をそのままコピー」では不可。**組織継承マッピング**を経由する必要がある
- 比較軸は「旧組織 ↔ 新組織」の 1:1 対応ではなく、人ベース・旧組織軸・新組織軸の 3 視点が必要
- 将来的には配布・回収のマージ工程を撤廃する方向（`mergeExcelData` は段階的廃止対象）

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

### specを読んで実装するときの手順

1. `CLAUDE.md`（このファイル）を読む
2. 対象の spec ファイルを読む（G1 → G2 → G3 の順が依存関係に沿っている）
3. 実装する
4. `npx tsc --noEmit` で型チェック
5. specファイルの実装状況（✗ → ✓）を更新する

### 未確認事項の扱い

spec内の `❓` マークは業務確認待ち。確認が取れる前に実装しない。
`TODO` は実装方針が決まっているが未着手のもの。
