# CLAUDE.md — apps/server

Hono + SQLite ローカルデモサーバー。Aurora 互換スキーマ。

## コマンド

```bash
npm run dev    # tsx watch src/index.ts （ポート 3000）
npx tsc --noEmit
```

## 構成

```
src/
  index.ts          ← Hono アプリ、ルート登録
  db/
    schema.sql      ← テーブル定義（Aurora 互換）
    sqlite.ts       ← better-sqlite3 接続（WAL・外部キーON・自動マイグレーション）
  auth/
    stub.ts         ← X-User-Id ヘッダーでユーザー解決（SSO アダプタの stub）
  routes/
    auth.ts         ← /api/auth
    sessions.ts     ← /api/sessions
    submit.ts       ← /api/sessions/:id/submit
    admin/
      users.ts      ← /api/admin/users（ユーザー CRUD）
      （新規管理機能はここに追加）
```

管理画面 UI は `apps/web/src/components/admin/` に置く（別パッケージは作らない）。
API ルートを追加したら、`apps/web/src/infrastructure/api/adminApi.ts` にクライアントメソッドも追加する。

## 認証 stub の使い方

本番 SSO の代わりに `X-User-Id` ヘッダーでユーザーを解決する。

```typescript
import { resolveUser, getAccessPolicy } from '../auth/stub'

const user = resolveUser(c.req.header('X-User-Id') ?? '')
if (!user) return c.json({ error: 'Unauthorized' }, 401)

const policy = getAccessPolicy(user.id)
// policy.orgLevelMin, policy.orgCodes で行のフィルタリング
```

開発 UI では `userSwitcher` フィーチャーフラグが有効のとき、ユーザー切り替え UI が表示される。
`listUsers()` でデモ用ユーザー一覧を返す。

## DB スキーマの主要テーブル

| テーブル | 用途 |
|---|---|
| `users` | ユーザー（id, email, display_name, role） |
| `user_access_policies` | アクセス制御（org_level_min, org_codes JSON） |
| `sessions` | 申請セッション（Excel 1回分の作業単位） |
| `allocation_rows` | AllocationRow を JSON で保存 |
| `consistency_issues` | クロス集計整合エラー |

## ドメインロジックの利用

サーバーからドメイン層の純粋関数を使う：

```typescript
import { validateCrossRowConsistency } from '@personnel/domain/validation/validateCrossRowConsistency'
```

ロジックをサーバーに直接書かない。必ず `@personnel/domain` に実装してから呼ぶ。

## CORS

開発時は `http://localhost:5173` からのリクエストを許可している。
本番デプロイ時は環境変数で制御する想定。
