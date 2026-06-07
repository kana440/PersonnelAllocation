import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from '../schema.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
// adapters/ → db/ → src/ → server/
const DATA_DIR       = process.env.DB_PATH ?? join(__dirname, '../../../data/pglite')
const MIGRATIONS_DIR = join(__dirname, '../drizzle')
const SEED_PATH      = join(__dirname, '../seeds/demo.sql')

export type DB = ReturnType<typeof drizzle<typeof schema>>

let _dbPromise: Promise<DB> | null = null

async function createDb(): Promise<DB> {
  const client = new PGlite(DATA_DIR)
  await client.waitReady

  const db = drizzle({ client, schema })

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  if (process.env.NODE_ENV !== 'production') {
    const seed = readFileSync(SEED_PATH, 'utf-8')
    await client.exec(seed)
  }

  return db
}

/** DB を初期化して返す。複数回呼ばれても1度しか初期化しない */
export function getDb(): Promise<DB> {
  if (!_dbPromise) _dbPromise = createDb()
  return _dbPromise
}
