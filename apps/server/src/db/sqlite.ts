import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
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

  runMigrations(_db)

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  _db.exec(schema)

  if (process.env.NODE_ENV !== 'production') {
    const seed = readFileSync(join(__dirname, 'seeds/demo.sql'), 'utf-8')
    _db.exec(seed)
  }

  return _db
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>)
      .map(r => r.name)
  )

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    if (!shouldApply(db, file)) {
      // 前提条件を満たさないマイグレーションはスキップして適用済みとして記録
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
      continue
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    console.log(`[migration] applied: ${file}`)
  }
}

// マイグレーションの前提条件チェック（スキーマ差分検出）
function shouldApply(db: Database.Database, file: string): boolean {
  switch (file) {
    case '0001_add_users_role.sql': {
      const tables = (db.pragma('table_list') as Array<{ name: string }>).map(r => r.name)
      if (!tables.includes('users')) return false
      const cols = (db.pragma('table_info(users)') as Array<{ name: string }>).map(c => c.name)
      return !cols.includes('role')
    }
    case '0002_rebuild_positions.sql': {
      const cols = (db.pragma('table_info(positions)') as Array<{ name: string }>).map(c => c.name)
      return cols.includes('department_code')
    }
    default:
      return true
  }
}
