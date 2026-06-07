/**
 * DB 接続エントリポイント
 *
 * DATABASE_URL が設定されていれば Aurora (PostgreSQL) アダプタ、
 * なければ PGlite アダプタを動的 import して返す。
 *
 * どちらも同じ schema.ts (pgTable) を使うため、
 * ルートコードは切り替えを意識せず `await getDb()` だけで使える。
 *
 * 環境変数:
 *   DATABASE_URL   未設定 → PGlite (dev)
 *                  設定済み → Aurora / PostgreSQL (prod/staging)
 *   DB_PATH        PGlite データディレクトリ（デフォルト: data/pglite）
 *   AUTO_MIGRATE   false にするとスタートアップ migrate をスキップ（Aurora 本番向け）
 *   DB_POOL_MAX    Aurora 接続プールサイズ（デフォルト: 10）
 */

import type { DB as PgliteDB } from './adapters/pglite.ts'

// PGlite と Aurora (node-postgres) はどちらも同じ PostgreSQL Drizzle API を実装する。
// PGlite の型を正規型として使用し、Aurora アダプタは実行時互換で動作する。
export type DB = PgliteDB

let _promise: Promise<DB> | null = null

export function getDb(): Promise<DB> {
  if (!_promise) {
    _promise = (
      process.env.DATABASE_URL
        ? import('./adapters/aurora.ts').then(m => m.getDb())
        : import('./adapters/pglite.ts').then(m => m.getDb())
    ) as Promise<DB>
  }
  return _promise
}
