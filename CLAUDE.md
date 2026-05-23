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

シナリオは `src/infrastructure/ai/scenarios/`（8種）。

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
