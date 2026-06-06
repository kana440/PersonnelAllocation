import { Hono } from 'hono'
import { getDb } from '../db/sqlite.ts'
import { authMiddleware, getAccessPolicy } from '../auth/stub.ts'
import type { AppEnv } from '../auth/stub.ts'
import type { AllocationRow } from '@personnel/domain/allocationRow'

const app = new Hono<AppEnv>()

app.use('*', authMiddleware)

// セッション内の行一覧（アクセスポリシーでフィルタ）
app.get('/:sessionId/rows', (c) => {
  const user = c.get('user')
  const db = getDb()
  const policy = getAccessPolicy(user.id)

  const rawRows = db.prepare(
    'SELECT row_id, assignee, data, updated_at FROM allocation_rows WHERE session_id = ?'
  ).all(c.req.param('sessionId')) as { row_id: number; assignee: string | null; data: string; updated_at: string }[]

  const rows = rawRows
    .map(r => ({ ...JSON.parse(r.data) as AllocationRow, _assignee: r.assignee, _updatedAt: r.updated_at }))
    .filter(row => {
      if (policy.orgLevelMin === null && policy.orgCodes === null) return true
      const level = (row as Record<string, unknown>)['orgLevel'] as number | undefined
      const orgCode = (row as Record<string, unknown>)['departmentCode'] as string | undefined
      if (policy.orgLevelMin !== null && (level === undefined || level < policy.orgLevelMin)) return false
      if (policy.orgCodes !== null && (!orgCode || !policy.orgCodes.includes(orgCode))) return false
      return true
    })

  return c.json(rows)
})

// 行の一括アップサート（Excel アップロード後の提出）
app.put('/:sessionId/rows', async (c) => {
  const user = c.get('user')
  const db = getDb()
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(c.req.param('sessionId'))
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const rows = await c.req.json<AllocationRow[]>()
  const upsert = db.prepare(`
    INSERT INTO allocation_rows (session_id, row_id, assignee, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, row_id) DO UPDATE SET
      data       = excluded.data,
      assignee   = excluded.assignee,
      updated_at = datetime('now')
  `)

  const insertMany = db.transaction((items: AllocationRow[]) => {
    for (const row of items) {
      upsert.run(c.req.param('sessionId'), row.rowId, user.id, JSON.stringify(row))
    }
  })
  insertMany(rows)

  return c.json({ saved: rows.length })
})

// 整合エラー一覧
app.get('/:sessionId/issues', (c) => {
  const db = getDb()
  const issues = db.prepare(
    'SELECT * FROM consistency_issues WHERE session_id = ? ORDER BY created_at DESC'
  ).all(c.req.param('sessionId'))
  return c.json(issues)
})

export default app
