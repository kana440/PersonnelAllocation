# /new-op <操作名> — 新しい業務操作のスケルトンを生成

引数: 操作名（例: `/new-op TransferPerson`）

CLAUDE.md の EditCommand パターンに従い、以下を生成する:

1. `packages/domain/src/commands/handlers/<name>.ts` — validate + apply の実装スケルトン
2. `packages/domain/src/patterns/editPatterns.ts` への新 EditPattern 追加
3. `apps/web/src/application/aiTools.ts` への追加コメント（AI に公開する場合）

生成前に、既存の操作ハンドラ（`packages/domain/src/commands/handlers/positionOps.ts`、`directEdit.ts`、`moveRowsToOrg.ts`）を参照してパターンの整合性を確認すること。

生成後に `cd apps/web && npx tsc --noEmit` で型チェックを実行する。
