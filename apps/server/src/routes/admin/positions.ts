import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getDb } from '../../db/sqlite.ts'
import type { AppEnv } from '../../auth/stub.ts'

const app = new Hono<AppEnv>()

// ── スキーマ ────────────────────────────────────────────────────

const SF_CODE = /^P\d{8}$/

const bulkRegisterSchema = z.object({
  codes: z
    .array(z.string().regex(SF_CODE, 'P + 8桁の形式（例: P00001234）で入力してください'))
    .min(1, '1件以上入力してください'),
})

const positionUpdateSchema = z.object({
  status:      z.enum(['available', 'in_use', 'retired']).optional(),
  acquired_by: z.string().nullable().optional(),
  acquired_at: z.string().nullable().optional(),
  notes:       z.string().nullable().optional(),
})

// ── 型定義 ──────────────────────────────────────────────────────

export interface AdminPosition {
  code:         string
  status:       'available' | 'in_use' | 'retired'
  acquiredBy:   string | null
  acquiredAt:   string | null
  notes:        string | null
  registeredBy: string | null
  registeredAt: string
  updatedAt:    string
}

export interface BulkRegisterResult {
  registered: string[]   // 新規登録されたコード
  skipped:    string[]   // すでに存在したコード
}

// ── ヘルパー ────────────────────────────────────────────────────

function toAdminPosition(row: Record<string, unknown>): AdminPosition {
  return {
    code:         row.code          as string,
    status:       row.status        as 'available' | 'in_use' | 'retired',
    acquiredBy:   (row.acquired_by  as string | null) ?? null,
    acquiredAt:   (row.acquired_at  as string | null) ?? null,
    notes:        (row.notes        as string | null) ?? null,
    registeredBy: (row.registered_by as string | null) ?? null,
    registeredAt: row.registered_at  as string,
    updatedAt:    row.updated_at     as string,
  }
}

// ── ルート ──────────────────────────────────────────────────────

// ポジション一覧（status でフィルタ可能）
app.get('/', (c) => {
  const db = getDb()
  const status = c.req.query('status') // available | in_use | retired | undefined(全件)
  const rows = status
    ? db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY code').all(status)
    : db.prepare('SELECT * FROM positions ORDER BY status, code').all()
  return c.json((rows as Record<string, unknown>[]).map(toAdminPosition))
})

// ステータス別件数サマリ
app.get('/summary', (c) => {
  const db = getDb()
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM positions GROUP BY status"
  ).all() as Array<{ status: string; count: number }>
  const summary = { available: 0, in_use: 0, retired: 0 }
  rows.forEach(r => {
    if (r.status in summary) summary[r.status as keyof typeof summary] = r.count
  })
  return c.json(summary)
})

// 一括登録
app.post('/bulk', zValidator('json', bulkRegisterSchema), (c) => {
  const user = c.get('user')
  const { codes } = c.req.valid('json')
  const db = getDb()

  const registered: string[] = []
  const skipped: string[] = []

  const insert = db.prepare(
    'INSERT OR IGNORE INTO positions (code, registered_by) VALUES (?, ?)'
  )
  const bulkInsert = db.transaction(() => {
    for (const code of codes) {
      const result = insert.run(code, user.id)
      if (result.changes > 0) registered.push(code)
      else skipped.push(code)
    }
  })
  bulkInsert()

  return c.json({ registered, skipped } satisfies BulkRegisterResult, 201)
})

// ポジション更新（取得・廃止・備考編集・差し戻し）
app.put('/:code', zValidator('json', positionUpdateSchema), (c) => {
  const code = c.req.param('code')
  const body = c.req.valid('json')
  const db = getDb()

  const existing = db.prepare('SELECT code FROM positions WHERE code = ?').get(code)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  if (body.status      !== undefined) { sets.push('status = ?');       vals.push(body.status) }
  if (body.acquired_by !== undefined) { sets.push('acquired_by = ?');  vals.push(body.acquired_by) }
  if (body.acquired_at !== undefined) { sets.push('acquired_at = ?');  vals.push(body.acquired_at) }
  if (body.notes       !== undefined) { sets.push('notes = ?');        vals.push(body.notes) }

  vals.push(code)
  db.prepare(`UPDATE positions SET ${sets.join(', ')} WHERE code = ?`).run(...vals)

  const row = db.prepare('SELECT * FROM positions WHERE code = ?').get(code) as Record<string, unknown>
  return c.json(toAdminPosition(row))
})

// プールから削除（available のみ）
app.delete('/:code', (c) => {
  const code = c.req.param('code')
  const db = getDb()

  const row = db.prepare('SELECT code, status FROM positions WHERE code = ?').get(code) as
    { code: string; status: string } | undefined
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.status !== 'available') return c.json({ error: '利用可能状態のコードのみ削除できます' }, 409)

  db.prepare('DELETE FROM positions WHERE code = ?').run(code)
  return c.body(null, 204)
})

export default app
