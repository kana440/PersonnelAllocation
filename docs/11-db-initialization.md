# 11 — DB 初期化・マイグレーション戦略

> **ステータス**: 実装済み（2026-06 — Drizzle ORM + PGlite に移行）

PGlite/Aurora アダプタ切り替え・ファイル構成・`getDb()` パターンは `apps/server/CLAUDE.md` の
「DB アダプタの切り替え」セクションを参照（ここでは繰り返さない）。
どちらの環境も同じ `schema.ts`（`pgTable`）と同じ Drizzle マイグレーション SQL を使う。

---

## 起動時の初期化順序（PGlite）

```
1. PGlite クライアント起動（data/pglite/ ディレクトリに永続化）
2. drizzle-orm/pglite/migrator が drizzle/ の SQL を番号順に適用（未適用のみ）
3. seeds/demo.sql を実行（NODE_ENV !== 'production' のときのみ）
```

サーバー起動時（`index.ts`）に `await getDb()` を呼ぶことで事前接続・マイグレーションを完了させる。

---

## スキーマ変更の実例

`schema.ts` にカラムを追加 → `drizzle-kit generate` でマイグレーション SQL を生成 → 再起動で自動適用、という流れの具体例。

```typescript
// apps/server/src/db/schema.ts（新しいカラムを追加した例）
export const users = pgTable('users', {
  id:    text('id').primaryKey(),
  name:  text('name').notNull(),
  email: text('email').notNull().unique(),
  role:  text('role').notNull().default('assignee'),
  // ↓ 追加
  department: text('department'),
})
```

```bash
cd apps/server
npx drizzle-kit generate
# → src/db/drizzle/0001_xxx.sql が生成される
```

サーバー再起動時に `migrate()` が自動適用する。

---

## DB リセット（ローカル開発）

```bash
npm run db:reset   # data/pglite/ ディレクトリを削除 → 次回起動時に再初期化
```

---

## seed データの方針

`seeds/demo.sql` はローカル開発・デモ用の初期データ。`NODE_ENV !== 'production'` のときのみ実行される。
`ON CONFLICT DO NOTHING` で書く（冪等）。本番 DB に seed を流してしまわないよう、
`NODE_ENV=production` での実行は自動的にスキップされる。

---

## Aurora 本番デプロイ

```bash
# スタートアップ migrate を無効化してデプロイスクリプト側で実行する場合
AUTO_MIGRATE=false
npx drizzle-kit migrate
```

`DATABASE_URL` が設定されていると `database.ts` が自動的に Aurora アダプタを選択し、
`NODE_ENV=production` のとき SSL（`rejectUnauthorized: true`）が有効になる。環境変数一覧は
`apps/server/CLAUDE.md` 参照。
