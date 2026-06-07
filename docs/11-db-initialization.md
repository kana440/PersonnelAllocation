# 11 — DB 初期化・マイグレーション戦略

> **ステータス**: 実装済み（2026-06 — Drizzle ORM + PGlite に移行）

---

## 概要

| 環境 | DB | アダプタ |
|---|---|---|
| ローカル開発 | PGlite（PostgreSQL WASM、サーバー不要） | `src/db/adapters/pglite.ts` |
| 本番 / staging | Aurora Serverless v2 / RDS PostgreSQL | `src/db/adapters/aurora.ts` |

どちらも同じ `schema.ts`（`pgTable`）と同じ Drizzle マイグレーション SQL を使う。

---

## ファイル構成

```
apps/server/
  src/db/
    schema.ts             ← Drizzle スキーマ定義（テーブル定義の Single Source）
    database.ts           ← DB エントリポイント（環境変数でアダプタ切り替え）
    adapters/
      pglite.ts           ← PGlite アダプタ（dev）
      aurora.ts           ← Aurora / node-postgres アダプタ（prod）
    drizzle/              ← drizzle-kit generate が生成するマイグレーション SQL
    seeds/
      demo.sql            ← デモデータ（PostgreSQL 構文、ON CONFLICT DO NOTHING）
  drizzle.config.ts       ← drizzle-kit 設定（dialect: postgresql）
  data/pglite/            ← PGlite データディレクトリ（gitignore 対象）
```

---

## 起動時の初期化順序（PGlite）

```
1. PGlite クライアント起動（data/pglite/ ディレクトリに永続化）
2. drizzle-orm/pglite/migrator が drizzle/ の SQL を番号順に適用（未適用のみ）
3. seeds/demo.sql を実行（NODE_ENV !== 'production' のときのみ）
```

サーバー起動時（`index.ts`）に `await getDb()` を呼ぶことで事前接続・マイグレーションを完了させる。

---

## スキーマ変更の手順

### ① schema.ts を変更する

```typescript
// src/db/schema.ts（新しいカラムを追加した例）
export const users = pgTable('users', {
  id:    text('id').primaryKey(),
  name:  text('name').notNull(),
  email: text('email').notNull().unique(),
  role:  text('role').notNull().default('assignee'),
  // ↓ 追加
  department: text('department'),
})
```

### ② drizzle-kit generate でマイグレーション SQL を生成する

```bash
cd apps/server
npx drizzle-kit generate
# → src/db/drizzle/0001_xxx.sql が生成される
```

### ③ サーバーを再起動する

起動時に `migrate()` が自動適用する。

---

## DB リセット（ローカル開発）

```bash
npm run db:reset   # data/pglite/ ディレクトリを削除 → 次回起動時に再初期化
```

---

## seed データの方針

| ファイル | 用途 | 実行タイミング |
|---|---|---|
| `seeds/demo.sql` | ローカル開発・デモ用の初期データ | `NODE_ENV !== 'production'` のみ |

seed は `ON CONFLICT DO NOTHING` で書く（冪等）。

本番 DB に seed を流してしまわないよう、`NODE_ENV=production` での実行は自動的にスキップされる。

---

## Aurora 本番環境

```bash
# 接続設定（.env.example 参照）
DATABASE_URL=postgresql://user:password@aurora-cluster.xxxx.rds.amazonaws.com:5432/personnel
NODE_ENV=production

# スタートアップ migrate を無効化してデプロイスクリプト側で実行する場合
AUTO_MIGRATE=false
npx drizzle-kit migrate
```

`DATABASE_URL` が設定されていると `database.ts` が自動的に Aurora アダプタを選択する。
`NODE_ENV=production` のとき SSL（`rejectUnauthorized: true`）が有効になる。

---

## Drizzle ORM クエリパターン

```typescript
import { getDb } from '../db/database.ts'
import { eq, desc } from 'drizzle-orm'
import { users } from '../db/schema.ts'

const db = await getDb()

// SELECT
const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)

// INSERT
await db.insert(users).values({ id, name, email, role: 'assignee' })

// UPDATE
await db.update(users).set({ name }).where(eq(users.id, id))

// TRANSACTION
await db.transaction(async (tx) => {
  await tx.insert(rounds).values(roundData)
  await tx.insert(allocationRows).values(rowsData)
})
```
