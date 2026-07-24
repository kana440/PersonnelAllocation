# CLAUDE.md — apps/server

Hono + PGlite ローカルデモサーバー。本番は Aurora (PostgreSQL)。
DB アクセスはすべて **Drizzle ORM**（型安全・非同期）。

## コマンド

```bash
npm run dev         # tsx watch src/index.ts（ポート 3000）
npm run db:reset    # PGlite データディレクトリを削除して再初期化
npx tsc --noEmit    # 型チェック
npx drizzle-kit generate  # schema.ts 変更後にマイグレーション SQL を生成
```

## 構成

```
src/
  index.ts              ← Hono アプリ、ルート登録、起動時 DB 接続
  db/
    schema.ts           ← Drizzle スキーマ定義（pgTable。テーブル定義の Single Source）
    database.ts         ← DB 接続エントリポイント（アダプタ切り替え）
    adapters/
      pglite.ts         ← PGlite アダプタ（dev。サーバー不要）
      aurora.ts         ← Aurora / PostgreSQL アダプタ（prod）
    drizzle/            ← drizzle-kit generate が生成するマイグレーション SQL
    seeds/
      demo.sql          ← デモデータ（開発専用、PostgreSQL 構文）
  auth/
    stub.ts             ← X-User-Id ヘッダーでユーザー解決（async）
  routes/
    auth.ts             ← /api/auth
    rounds.ts           ← /api/rounds（ラウンド CRUD + Excel アップロード）
    submissions.ts      ← /api/submissions（提出・委任・3-way merge）
    ai.ts               ← /api/ai（LLM プロキシ。STEP1/STEP2 共通）
    domain.ts           ← /api/domain（読み取り専用の軽量ドメイン計算）
    admin/
      users.ts          ← /api/admin/users（ユーザー CRUD）
      positions.ts      ← /api/admin/positions（ポジション管理）
      skills.ts         ← /api/admin/skills（AI スキル管理）
drizzle.config.ts       ← drizzle-kit 設定（dialect: postgresql）
data/pglite/            ← PGlite データディレクトリ（gitignore 対象）
```

管理画面 UI は `apps/web/src/components/admin/` に置く（別パッケージは作らない）。
API ルートを追加したら、`apps/web/src/infrastructure/api/adminApi.ts` にクライアントメソッドも追加する。

## DB アダプタの切り替え

```
DATABASE_URL 未設定 → PGlite（ローカル dev。PostgreSQL WASM、サーバー不要）
DATABASE_URL 設定済み → Aurora / PostgreSQL（本番 / staging）
```

`database.ts` が環境変数を見て動的 import するため、ルートコードは `await getDb()` だけで使える。

```typescript
// すべてのルートでこのパターンを使う
import { getDb } from '../db/database.ts'

app.get('/', async (c) => {
  const db = await getDb()
  const rows = await db.select().from(myTable).where(eq(myTable.id, id))
  return c.json(rows)
})
```

## Drizzle ORM のキー命名規則

DB カラムは snake_case だが、Drizzle スキーマの TypeScript プロパティは camelCase。
**`ApiXxx` インターフェースも camelCase** で定義する。これにより Drizzle の自然な返却型と一致し、
エイリアスなしで型安全に `c.json()` できる。

```typescript
// ✅ OK: Drizzle が camelCase で返す → ApiXxx の camelCase と一致
const rows = await db.select().from(submissions)
// result: { roundCompanyId: '...', parentId: '...' } ← ApiSubmission と同じ形

// JOIN や computed field が必要なときだけ明示（camelCase で）
const rows = await db.select({
  id:           submissions.id,
  roundLabel:   rounds.label,
  assigneeName: users.name,
  rowCount:     sql<number>`(SELECT COUNT(*)::int FROM ...)`,
}).from(submissions).leftJoin(...)
```

**ルール**:
- `ApiXxx` インターフェースのフィールドは camelCase。
- `sql<T>` サブクエリのエイリアスも camelCase（例: `rowCount: sql<number>\`...\``）。
- 新しいエンドポイントを追加したら、`ApiXxx` インターフェースと `.select({})` のキーが一致しているか確認する。

## スキーマ変更の手順

1. `src/db/schema.ts` を編集（`pgTable` で定義）
2. `npx drizzle-kit generate` を実行 → `src/db/drizzle/` に SQL が生成される
3. サーバーを再起動 → 起動時に自動マイグレーションが適用される

> **Aurora 本番では** `AUTO_MIGRATE=false` にして、デプロイスクリプト側で `npx drizzle-kit migrate` を実行することを推奨。

## 環境変数（`.env.example` 参照）

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DATABASE_URL` | 未設定 | 設定すると Aurora アダプタを使用 |
| `DB_PATH` | `data/pglite` | PGlite データディレクトリ |
| `NODE_ENV` | `development` | `production` で Aurora SSL を有効化 |
| `AUTO_MIGRATE` | （未設定） | `false` にするとスタートアップ migrate をスキップ |
| `DB_POOL_MAX` | `10` | Aurora 接続プールサイズ |
| `PORT` | `3000` | サーバーポート |

## DB スキーマの主要テーブル

| テーブル | 用途 |
|---|---|
| `users` | ユーザー（id, email, name, role） |
| `rounds` | ラウンド（作業単位） |
| `round_companies` | ラウンド × 会社（Round は複数会社をまとめる単位） |
| `round_company_files` | ラウンド×会社に紐づく Excel ファイル（base64 text） |
| `allocation_rows` | AllocationRow を JSON で保存 |
| `submissions` | 提出・委任（3-way merge の branch 単位） |
| `submission_rows` | Submission ごとの行スナップショット |
| `notifications` | 委任・提出・差し戻し等の通知ログ |

Revision（改訂履歴）管理は検討の上、実装しないことを決定済み（`docs/12-step2-requirements.md` §13 参照。確定状態は `allocation_rows` を持つ closed Round が代替する）。

## 認証 stub の使い方

本番 SSO の代わりに `X-User-Id` ヘッダーでユーザーを解決する。

```typescript
import { resolveUser, getAccessPolicy } from '../auth/stub.ts'

// middleware で解決済み → c.get('user') で取得
const user = c.get('user')
if (!user) return c.json({ error: 'Unauthorized' }, 401)
```

開発 UI では `userSwitcher` フィーチャーフラグが有効のとき、ユーザー切り替え UI が表示される。

## ドメインロジックの利用

サーバーからドメイン層の純粋関数を使う：

```typescript
import { validateCrossRowConsistency } from '@personnel/domain/rules/validate/crossRowConsistency'
```

ロジックをサーバーに直接書かない。必ず `@personnel/domain` に実装してから呼ぶ。

## CORS

開発時は `http://localhost:5173` からのリクエストを許可している。
本番デプロイ時は環境変数で制御する想定。
