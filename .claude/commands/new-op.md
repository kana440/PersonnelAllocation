# /new-op <操作名> — 新しい業務操作のスケルトンを生成

引数: 操作名（例: `/new-op TransferPerson`）

CLAUDE.md の EditCommand パターンに従い、以下を生成・更新する:

## 生成・更新ファイル

1. **`packages/domain/src/patterns/editPatterns.ts`** — 新 EditPattern 定数を追加
2. **`packages/domain/src/patterns/defs/<group>.ts`** — `detect()` 実装を追加（jobClassification / position / person / secondment / legacy のうち該当グループ）
3. **`packages/domain/src/commands/handlers/<name>.ts`** — validate + apply の実装スケルトン
4. **`packages/domain/src/commands/defs/<group>Defs.ts`** — `OperationDef` を追加し `DEFS` 配列に登録
5. **`packages/domain/src/commands/defs/index.ts`** — re-export に追加
6. **`apps/web/src/components/editor/PersonOperationPanel/SummaryView.tsx`** — `SECTIONS` に `{ id, shortLabel }` を追加（**これを忘れると UI に表示されない**）

バリデーション追加（リストア保証の維持）は `/add-validation` コマンドで別途実施。

## 参照先

- 既存実装例: `packages/domain/src/commands/handlers/positionOps.ts`（4種）、`personOps.ts`、`directEdit.ts`
- OperationDef 例: `packages/domain/src/commands/defs/personDefs.ts`（description / inputType: 'checkbox' / readOnly 等）
- 取消操作パターン（セッション内取消）: `leaveOfAbsenceCancelDef` — 別 OperationDef + `availableFor` 排他制御 + `DirectEditOperation` で戻す

## 生成後チェック

```bash
cd packages/domain && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```
