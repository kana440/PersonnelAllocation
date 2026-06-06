import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/local.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  _db.exec(schema)

  // 既存DBへのカラム追加マイグレーション
  const userCols = (_db.pragma('table_info(users)') as Array<{ name: string }>).map(c => c.name)
  if (!userCols.includes('role')) {
    _db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'assignee'`)
    _db.exec(`UPDATE users SET role = 'super_admin' WHERE id = 'user-admin'`)
    _db.exec(`UPDATE users SET role = 'admin'       WHERE id IN ('user-dept-a', 'user-dept-b')`)
  }

  return _db
}
