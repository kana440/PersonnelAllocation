import { Hono } from 'hono'
import { getDb } from '../db/sqlite.ts'
import { authMiddleware } from '../auth/stub.ts'
import type { AppEnv } from '../auth/stub.ts'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { validateCrossRowConsistency } from '@personnel/domain/validation/validateCrossRowConsistency'

const app = new Hono<AppEnv>()

app.use('*', authMiddleware)

// 提出 & 整合チェック
// POST /sessions/:id/submit
// → 出向/兼務の同一 groupMemberId 行間で band 等を自動チェック
// → 矛盾があれば consistency_issues に記録し、関係者への通知キューに積む
app.post('/:sessionId/submit', (c) => {
  const db = getDb()
  const sessionId = c.req.param('sessionId')

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    { id: string; status: string } | undefined
  if (!session) return c.json({ error: 'Session not found' }, 404)

  // 全行取得
  const rawRows = db.prepare(
    'SELECT data FROM allocation_rows WHERE session_id = ?'
  ).all(sessionId) as { data: string }[]
  const rows = rawRows.map(r => JSON.parse(r.data) as AllocationRow)

  // ── 整合チェック: domain 層の純粋関数に委譲 ─────────────────────────────────
  const domainIssues = validateCrossRowConsistency(rows)
  const issues = domainIssues.map(i => ({
    groupMemberId: i.groupEmployeeId,
    field:         i.field,
    valueA:        i.valueA,
    valueB:        i.valueB,
  }))

  // 既存の open issue をクリアして再登録
  db.prepare("DELETE FROM consistency_issues WHERE session_id = ? AND status = 'open'").run(sessionId)

  const insertIssue = db.prepare(`
    INSERT INTO consistency_issues (session_id, group_member_id, field, value_a, value_b)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const issue of issues) {
    insertIssue.run(sessionId, issue.groupMemberId, issue.field, issue.valueA, issue.valueB)
  }

  // セッションステータスを更新
  const newStatus = issues.length === 0 ? 'submitted' : 'draft'
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(newStatus, sessionId)

  return c.json({
    status:      newStatus,
    issueCount:  issues.length,
    issues,
  })
})

export default app
