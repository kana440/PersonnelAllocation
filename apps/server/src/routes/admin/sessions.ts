import { Hono } from 'hono'
import { getDb } from '../../db/sqlite.ts'
import type { AppEnv } from '../../auth/stub.ts'

const app = new Hono<AppEnv>()

export interface AdminSession {
  id:           string
  name:         string
  status:       'draft' | 'submitted' | 'finalized'
  created_by:   string
  creator_name: string | null
  created_at:   string
  row_count:    number
}

// セッション一覧（作成者名・行数付き）
app.get('/', (c) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT s.id, s.name, s.status, s.created_by,
           u.name AS creator_name, s.created_at,
           COUNT(ar.id) AS row_count
    FROM sessions s
    LEFT JOIN users u ON s.created_by = u.id
    LEFT JOIN allocation_rows ar ON ar.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all() as AdminSession[]
  return c.json(rows)
})

// セッション削除（draft のみ許可）
app.delete('/:id', (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(id) as
    { id: string; status: string } | undefined
  if (!session) return c.json({ error: 'Not found' }, 404)
  if (session.status !== 'draft') return c.json({ error: '下書き以外のセッションは削除できません' }, 409)
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  return c.body(null, 204)
})

export default app
