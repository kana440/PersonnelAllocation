# 11 — DB 初期化・マイグレーション戦略

> **ステータス**: 実装済み（2026-06）

---

## 構成

```
apps/server/src/db/
  schema.sql              ← DDL のみ（CREATE TABLE IF NOT EXISTS）
  seeds/
    demo.sql              ← デモデータ（開発・テスト専用）
  migrations/
    0001_add_users_role.sql
    0002_rebuild_positions.sql
    （スキーマ変更のたびに追番で追加）
  sqlite.ts               ← migration runner + 初期化ロジック
```

---

## 起動時の初期化順序

```
1. _migrations テーブルを作成（初回のみ）
2. migrations/*.sql を番号順に適用（未適用かつ前提条件を満たすものだけ）
3. schema.sql を実行（DDL）
4. seeds/demo.sql を実行（NODE_ENV !== 'production' のときのみ）
```

この順序を守ることで、古い DB ファイルを持つ開発者がサーバーを再起動するだけで自動的に最新スキーマに追いつける。

---

## マイグレーションファイルの追加方法

スキーマを変更するとき（カラム追加・テーブル再設計など）は、**schema.sql を直接変更するだけでなく**、マイグレーションファイルも追加する。

### ① schema.sql を変更する（最終形を反映）

```sql
-- schema.sql（新しいカラムを追加した例）
CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role  TEXT NOT NULL DEFAULT 'assignee'  -- 追加
);
```

### ② migrations/ に番号付きファイルを追加する

```sql
-- migrations/0003_add_xxx.sql
ALTER TABLE foo ADD COLUMN bar TEXT;
```

### ③ sqlite.ts の shouldApply() に前提条件を追加する（必要な場合）

前提条件チェックが必要なのは、**カラムが既に存在する場合に SQL が失敗するケース**（SQLite は `ADD COLUMN IF NOT EXISTS` をサポートしない）。

```typescript
case '0003_add_xxx.sql': {
  const cols = (db.pragma('table_info(foo)') as Array<{ name: string }>).map(c => c.name)
  return !cols.includes('bar')  // すでにあればスキップ
}
```

前提条件チェックが不要なシンプルな変更（新テーブル作成など）は `default: return true` に任せて、チェックを書かなくてよい。

---

## seed データの方針

| ファイル | 用途 | 実行タイミング |
|---|---|---|
| `seeds/demo.sql` | ローカル開発・デモ用の初期データ | `NODE_ENV !== 'production'` のみ |
| （将来）`seeds/fixtures.sql` | テスト用フィクスチャ | テストランナーから明示的に呼ぶ |

seed は **`INSERT OR IGNORE`** で書く。冪等にするため。

本番 DB に seed を流してしまわないよう、`NODE_ENV=production` での実行は自動的にスキップされる。

---

## 本番（Aurora）への移行時

現在は SQLite + 自作 runner だが、Aurora（PostgreSQL 互換）に移行する際は以下のいずれかを選択する：

### 選択肢 A: 自作 runner をそのまま移植（推奨・最小コスト）

`better-sqlite3` を `pg`（node-postgres）に差し替え、`_migrations` テーブルの管理ロジックをそのまま流用する。`migrations/*.sql` ファイルは Aurora でもそのまま使える（PostgreSQL 互換の SQL に書いている限り）。

### 選択肢 B: Flyway / Liquibase に委譲

CI/CD パイプラインに Flyway を組み込む。`migrations/*.sql` をそのまま渡せるため、ファイルの書き直しは不要。Flyway Community Edition は無料。

### 選択肢 C: Drizzle ORM + drizzle-kit

TypeScript でスキーマを定義し、`drizzle-kit generate` でマイグレーション SQL を自動生成する。ORM を導入することになるが、型安全なクエリが得られる。

**現時点の判断**: Aurora 移行が決定したタイミングで選択する。それまでは自作 runner を継続。
