# /new-op <操作名> — 新しい業務操作のスケルトンを生成

引数: 操作名（例: `/new-op TransferPerson`）

CLAUDE.md の IDomainOperation パターンに従い、以下を生成する:

1. `src/domain/operation/handlers/<name>.ts` — validate + apply の実装スケルトン
2. `src/application/aiTools.ts` への追加コメント（AIに公開する場合）

生成前に、既存の操作ハンドラ（positionOps.ts、directEdit.ts、moveRowsToOrg.ts）を参照して
パターンの整合性を確認すること。

生成後に `npx tsc --noEmit` で型チェックを実行する。
