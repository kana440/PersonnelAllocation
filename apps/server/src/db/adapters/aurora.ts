/**
 * Aurora (PostgreSQL) アダプタ
 *
 * DATABASE_URL が設定されているときに database.ts から動的 import される。
 * Aurora Serverless v2 / RDS PostgreSQL のどちらでも動作する。
 *
 * 必要な環境変数:
 *   DATABASE_URL  postgresql://user:pass@host:5432/dbname
 *   NODE_ENV      production の場合 SSL 必須（デフォルト: development）
 *   AUTO_MIGRATE  false にするとスタートアップ時の migrate をスキップ（デプロイスクリプト側で実行する場合）
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool }    from 'pg'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from '../schema.ts'

const __dirname      = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../drizzle')

export type DB = ReturnType<typeof drizzle<typeof schema>>

let _dbPromise: Promise<DB> | null = null

async function createDb(): Promise<DB> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL が設定されていません')

  const isProduction = process.env.NODE_ENV === 'production'

  const pool = new Pool({
    connectionString,
    // Aurora は SSL 必須。ローカル検証用に rejectUnauthorized を切り替え可能
    ssl: isProduction ? { rejectUnauthorized: true } : false,
    max:              Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  const db = drizzle({ client: pool, schema })

  // スタートアップ時の自動 migrate（本番では AUTO_MIGRATE=false にして
  // デプロイスクリプト側で `npx drizzle-kit migrate` を実行することを推奨）
  if (process.env.AUTO_MIGRATE !== 'false') {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  }

  return db
}

export function getDb(): Promise<DB> {
  if (!_dbPromise) _dbPromise = createDb()
  return _dbPromise
}
