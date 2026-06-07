# 10 — 課題と改善提案

> **ステータス**: 随時更新（2026-06）  
> 実装が決まったものは該当 spec に移動する。

---

## 1. 既知の技術的課題

### 1-1. テストファイルの型エラー（pre-existing）

`apps/web/tests/` に以下の既存型エラーがある（tsconfig の `include` 対象外のため現在は無視されているが放置するとデグレを検知できない）。

| ファイル | 問題 |
|---|---|
| `tests/choices/orgTree.test.ts` | `Organization` 型に `level` フィールドが欠落 |
| `tests/helpers/fixtures.ts` | 同上（`companyId` も欠落） |
| `tests/operations/positionOps.test.ts` | `Array.prototype.at` が ES2020 に存在しない（lib を ES2022 に上げれば解決） |
| `tests/validation/a-b-series.test.ts` | 未使用 import |

**推奨対処**: `apps/web/tsconfig.json` の `lib` を `ES2022` に上げ、`include` に `tests` を追加してすべて修正する。

### 1-2. depcruise 設定のパス更新未完

`.dependency-cruiser.cjs` は `apps/web/` に移動済みだが、ルール内のパス（`^src/domain` 等）が旧構造を参照している。モノレポ移行後は `packages/domain/` が独立パッケージになったため、ルールの見直しが必要。

**推奨対処**: `apps/web` スコープのルールに限定し直す。`packages/domain/` は package boundary で自然に保護されるため重複チェック不要。

### 1-3. apps/server の型チェックが CI に未統合

現在 `npm run test` は `apps/web` の vitest のみ。`apps/server` の `npx tsc --noEmit` は手動。

---

## 2. 短期改善提案（STEP1 リリース前）

### 2-1. `packages/domain` の独立型チェックを CI に追加

```bash
cd packages/domain && npx tsc --noEmit
```

ドメイン層が web に依存しないことを CI で保証する。

### 2-2. OpenAPI スペックの生成

`apps/server/src/routes/` の Hono ルートから OpenAPI スペックを自動生成し、フロントエンドの HTTP クライアントの型を自動導出する。

ツール候補: `hono-openapi` + `openapi-typescript`

---

## 3. 中期改善提案（STEP2 移行時）

### 3-1. `packages/types/` の追加（web と server で共有する型）

現在 `apps/web/src/ports/index.ts` に定義されている API 境界の型（リクエスト・レスポンス）を、web・server 双方が参照できる共有パッケージに切り出す。

```
packages/
  domain/     ← 業務ロジック（現在）
  types/      ← API 境界型・DTO（追加）
```

### 3-2. ポジション申請ワークフローの実装

`apps/server/` に以下を追加:
- `POST /api/positions/request` — 担当者が新ポジションをリクエスト
- `PATCH /api/positions/:id/assign` — 管理者がポジションコードを付与
- 採番完了の通知キュー登録

`packages/domain/src/commands/handlers/assignPositionCodes.ts` は既に実装済みなので、サーバー側のワークフローと繋ぐだけ。

### 3-3. 行レベルアクセス制御の強化

現在 `apps/server/src/routes/rows.ts` のポリシーフィルタは `orgLevel` と `orgCodes` のみ。実際の運用では「3階層以上かつ自社組織のみ」のような複合条件が必要。ポリシーモデルを拡張する。

---

## 4. 長期・高度化提案

### 4-1. Aurora 移行時のアダプタ差し替え

`apps/server/src/db/sqlite.ts` を `IAllocationRepository` インターフェース経由に変え、Aurora アダプタに差し替えられるようにする（現状は直接 SQLite を参照している）。

```typescript
// apps/server/src/ports/IAllocationRepository.ts
export interface IAllocationRepository {
  findRowsBySession(sessionId: string): Promise<AllocationRow[]>
  upsertRows(sessionId: string, rows: AllocationRow[]): Promise<void>
}
```

### 4-2. リアルタイム整合通知

現状は「提出時バッチチェック」だが、WebSocket や Server-Sent Events で複数担当者が同時編集したときの競合をリアルタイム検知する。

### 4-3. AI を整合チェックに活用

現状の整合チェックはフィールド値の単純比較（band 一致等）。将来は AI が「この出向は業務的に整合しているか」を自然言語で判断する補助ツールになりうる。

### 4-4. 変更サマリーの自動生成

`getReviewSummary()` の結果を LLM に渡し、「今回の発令内容の概要」を自動文章化する。取りまとめ担当の報告書作成コストを削減できる。

---

## 5. 運用・プロセス改善

### 5-1. Excel 提出フォーマットの versioning

現在 Excel フォーマットに版管理がない。`apps/server/` に「このファイルは旧フォーマットです」を検出する機能を追加し、移行期の混在を安全にハンドルする。

### 5-2. 担当者トレーニング素材の整備

STEP2 への移行時、担当者向けの「Excel からの移行ガイド」を docs に追加する（技術文書ではなく操作ガイド）。

### 5-3. 環境構築手順の整備

現在 `README.md` に開発環境セットアップ手順がない。新メンバーが `npm install && npm run dev` で動かせるまでの手順を追記する。
