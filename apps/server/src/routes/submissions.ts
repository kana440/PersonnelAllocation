import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, notInArray, desc, sql, count } from 'drizzle-orm'
import { getDb } from '../db/database.ts'
import type { DB } from '../db/database.ts'
import {
  submissions, submissionRows, allocationRows,
  roundCompanies, rounds, users, notifications,
} from '../db/schema.ts'
import { authenticated, requireRole } from '../auth/index.ts'
import type { AuthVariables } from '../auth/index.ts'
import { randomUUID } from 'crypto'
import { resolveScope, isScopeWithin } from '../lib/scopeFilter.ts'
import type { SubmissionScope } from '../lib/scopeFilter.ts'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { validateCrossRowConsistency } from '@personnel/domain/validation/validateCrossRowConsistency'
import { mergeSubmission, computeRowDiffs } from '@personnel/domain/diffMerge'

const app = new Hono<{ Variables: AuthVariables }>()
app.use('*', authenticated)

// ── 型定義 ───────────────────────────────────────────────────────────────────

type SubRecord = typeof submissions.$inferSelect
interface ConflictItem { rowId: number; fields: string[] }

// ── ヘルパー ─────────────────────────────────────────────────────────────────

async function loadRoundRows(db: DB, roundCompanyId: string): Promise<AllocationRow[]> {
  const rows = await db.select({ data: allocationRows.data })
    .from(allocationRows).where(eq(allocationRows.roundCompanyId, roundCompanyId))
  return rows.map(r => JSON.parse(r.data) as AllocationRow)
}

async function loadSubmissionRows(db: DB, submissionId: string): Promise<AllocationRow[]> {
  const rows = await db.select({ data: submissionRows.data })
    .from(submissionRows).where(eq(submissionRows.submissionId, submissionId))
  return rows.map(r => JSON.parse(r.data) as AllocationRow)
}

async function loadSnapshotRows(
  db: DB,
  parentSubmissionId: string,
  scopeIds: Set<number>,
  allRows: AllocationRow[],
): Promise<AllocationRow[]> {
  const parentRows = await loadSubmissionRows(db, parentSubmissionId)
  if (parentRows.length > 0) return parentRows.filter(r => scopeIds.has(r.rowId))
  return allRows.filter(r => scopeIds.has(r.rowId))
}

async function performMerge(db: DB, sub: SubRecord): Promise<ConflictItem[]> {
  const snapshotRows: AllocationRow[] = sub.snapshotData
    ? JSON.parse(sub.snapshotData) as AllocationRow[]
    : []

  const branchRows = await loadSubmissionRows(db, sub.id)
  const theirs = branchRows.length > 0 ? branchRows : snapshotRows

  let ours: AllocationRow[]
  if (sub.parentId) {
    const parentRows = await loadSubmissionRows(db, sub.parentId)
    ours = parentRows.length > 0 ? parentRows : await loadRoundRows(db, sub.roundCompanyId)
  } else {
    ours = await loadRoundRows(db, sub.roundCompanyId)
  }

  if (snapshotRows.length === 0) return []

  const mergeResults = mergeSubmission(snapshotRows, ours, theirs)
  const conflicts: ConflictItem[] = []

  await db.transaction(async (tx) => {
    if (sub.parentId) {
      for (const [rowId, result] of mergeResults) {
        await tx.insert(submissionRows)
          .values({ submissionId: sub.parentId, rowId, data: JSON.stringify(result.merged) })
          .onConflictDoUpdate({
            target: [submissionRows.submissionId, submissionRows.rowId],
            set:    { data: sql`excluded.data`, updatedAt: sql`now()` as unknown as string },
          })
        if (result.conflicts.length > 0)
          conflicts.push({ rowId, fields: result.conflicts as string[] })
      }
    } else {
      for (const [rowId, result] of mergeResults) {
        await tx.insert(allocationRows)
          .values({
            roundCompanyId: sub.roundCompanyId,
            submissionId: sub.id,
            rowId,
            data: JSON.stringify(result.merged),
          })
          .onConflictDoUpdate({
            target: [allocationRows.roundCompanyId, allocationRows.rowId],
            set:    {
              submissionId: sql`excluded.submission_id`,
              data:         sql`excluded.data`,
              updatedAt:    sql`now()` as unknown as string,
            },
          })
        if (result.conflicts.length > 0)
          conflicts.push({ rowId, fields: result.conflicts as string[] })
      }
    }

    if (conflicts.length > 0) {
      await tx.update(submissions)
        .set({ conflictFields: JSON.stringify(conflicts) })
        .where(eq(submissions.id, sub.id))
    }
  })

  return conflicts
}

async function forceCancelDescendants(db: DB, parentId: string): Promise<void> {
  const children = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(
      eq(submissions.parentId, parentId),
      notInArray(submissions.status, ['merged', 'cancelled']),
    ))
  for (const child of children) {
    await forceCancelDescendants(db, child.id)
    await db.update(submissions)
      .set({ status: 'cancelled', updatedAt: sql`now()` as unknown as string })
      .where(eq(submissions.id, child.id))
  }
}

// ── 一覧 ─────────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const subs = await db
    .select({
      id:              submissions.id,
      roundCompanyId:  submissions.roundCompanyId,
      roundId:         roundCompanies.roundId,
      companyId:       roundCompanies.companyId,
      parentId:        submissions.parentId,
      assigneeId:      submissions.assigneeId,
      scope:           submissions.scope,
      status:          submissions.status,
      requestComment:  submissions.requestComment,
      revisionComment: submissions.revisionComment,
      createdAt:       submissions.createdAt,
      updatedAt:       submissions.updatedAt,
      roundLabel:      rounds.label,
      roundKind:       rounds.kind,
      assigneeName:    users.name,
      rowCount: sql<number>`(
        SELECT COUNT(*)::int FROM submission_rows sr WHERE sr.submission_id = ${submissions.id}
      )`,
      childCount: sql<number>`(
        SELECT COUNT(*)::int FROM submissions c WHERE c.parent_id = ${submissions.id}
      )`,
      childDoneCount: sql<number>`(
        SELECT COUNT(*)::int FROM submissions c
        WHERE c.parent_id = ${submissions.id} AND c.status IN ('submitted', 'merged', 'cancelled')
      )`,
    })
    .from(submissions)
    .leftJoin(roundCompanies, eq(submissions.roundCompanyId, roundCompanies.id))
    .leftJoin(rounds, eq(roundCompanies.roundId, rounds.id))
    .leftJoin(users,  eq(submissions.assigneeId, users.id))
    .where(eq(submissions.assigneeId, user.id))
    .orderBy(desc(submissions.createdAt))
  return c.json(subs)
})

const createSubmissionSchema = z.object({
  roundCompanyId:      z.string().min(1),
  assigneeId:          z.string().min(1),
  parentSubmissionId:  z.string().optional(),
  scope:               z.object({ kind: z.string() }).passthrough(),
  requestComment:      z.string().optional(),
})

// ── 依頼作成 ─────────────────────────────────────────────────────────────────

app.post('/', requireRole('admin', 'coordinator'), zValidator('json', createSubmissionSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json') as { roundCompanyId: string; assigneeId: string; parentSubmissionId?: string; scope: SubmissionScope; requestComment?: string }

  const db = await getDb()
  const [rc] = await db
    .select({ id: roundCompanies.id })
    .from(roundCompanies).where(eq(roundCompanies.id, body.roundCompanyId)).limit(1)
  if (!rc) return c.json({ error: 'RoundCompany が見つかりません' }, 404)

  if (user.role === 'coordinator') {
    if (!body.parentSubmissionId) {
      return c.json({ error: 'coordinator はトップレベル Submission を作成できません' }, 403)
    }
    const [parent] = await db
      .select({ id: submissions.id, assigneeId: submissions.assigneeId, scope: submissions.scope, roundCompanyId: submissions.roundCompanyId })
      .from(submissions).where(eq(submissions.id, body.parentSubmissionId)).limit(1)
    if (!parent || parent.assigneeId !== user.id || parent.roundCompanyId !== body.roundCompanyId) {
      return c.json({ error: '自分の Submission の範囲内でのみ依頼できます' }, 403)
    }
    const allRows = await loadRoundRows(db, body.roundCompanyId)
    const parentScope = JSON.parse(parent.scope) as SubmissionScope
    const parentIds = new Set(resolveScope(parentScope, allRows))
    if (!isScopeWithin(body.scope, parentIds, allRows)) {
      return c.json({ error: '依頼するスコープが親 Submission のスコープを超えています' }, 400)
    }
  }

  const [assignee] = await db
    .select({ id: users.id, role: users.role })
    .from(users).where(eq(users.id, body.assigneeId)).limit(1)
  if (!assignee) return c.json({ error: '依頼先ユーザーが見つかりません' }, 404)
  if (user.role === 'coordinator' && assignee.role !== 'coordinator') {
    return c.json({ error: 'coordinator は coordinator にのみ依頼できます' }, 403)
  }

  const allRows  = await loadRoundRows(db, body.roundCompanyId)
  const scopeIds = new Set(resolveScope(body.scope, allRows))
  const snapshotRows = body.parentSubmissionId
    ? await loadSnapshotRows(db, body.parentSubmissionId, scopeIds, allRows)
    : allRows.filter(r => scopeIds.has(r.rowId))

  const id = randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(submissions).values({
      id,
      roundCompanyId: body.roundCompanyId,
      parentId:       body.parentSubmissionId ?? null,
      assigneeId:     body.assigneeId,
      scope:          JSON.stringify(body.scope),
      requestComment: body.requestComment ?? null,
      createdBy:      user.id,
      snapshotData:   JSON.stringify(snapshotRows),
    })

    if (snapshotRows.length > 0) {
      await tx.insert(submissionRows).values(
        snapshotRows.map(row => ({ submissionId: id, rowId: row.rowId, data: JSON.stringify(row) }))
      )
    }

    await tx.insert(notifications).values({
      recipientId: body.assigneeId,
      template:    'delegation',
      payload:     JSON.stringify({ submissionId: id, roundCompanyId: body.roundCompanyId, comment: body.requestComment }),
    })
  })

  return c.json({ id }, 201)
})

// ── 詳細 ─────────────────────────────────────────────────────────────────────

app.get('/:id', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select({
      id:              submissions.id,
      roundCompanyId:  submissions.roundCompanyId,
      roundId:         roundCompanies.roundId,
      companyId:       roundCompanies.companyId,
      parentId:        submissions.parentId,
      assigneeId:      submissions.assigneeId,
      scope:           submissions.scope,
      status:          submissions.status,
      requestComment:  submissions.requestComment,
      revisionComment: submissions.revisionComment,
      snapshotData:    submissions.snapshotData,
      conflictFields:  submissions.conflictFields,
      createdAt:       submissions.createdAt,
      updatedAt:       submissions.updatedAt,
      roundLabel:      rounds.label,
      assigneeName:    users.name,
    })
    .from(submissions)
    .leftJoin(roundCompanies, eq(submissions.roundCompanyId, roundCompanies.id))
    .leftJoin(rounds, eq(roundCompanies.roundId, rounds.id))
    .leftJoin(users,  eq(submissions.assigneeId, users.id))
    .where(eq(submissions.id, c.req.param('id')))
    .limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id) {
    return c.json({ error: '権限がありません' }, 403)
  }
  return c.json(sub)
})

// ── 子 Submission 一覧 ────────────────────────────────────────────────────────

app.get('/:id/children', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select({ id: submissions.id, assigneeId: submissions.assigneeId })
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id) {
    return c.json({ error: '権限がありません' }, 403)
  }

  const children = await db
    .select({
      id:              submissions.id,
      roundCompanyId:  submissions.roundCompanyId,
      parentId:        submissions.parentId,
      assigneeId:      submissions.assigneeId,
      scope:           submissions.scope,
      status:          submissions.status,
      requestComment:  submissions.requestComment,
      revisionComment: submissions.revisionComment,
      createdAt:       submissions.createdAt,
      updatedAt:       submissions.updatedAt,
      assigneeName:    users.name,
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.assigneeId, users.id))
    .where(eq(submissions.parentId, c.req.param('id')))
    .orderBy(submissions.createdAt)
  return c.json(children)
})

// ── 行一覧 ───────────────────────────────────────────────────────────────────

app.get('/:id/rows', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id) {
    return c.json({ error: '権限がありません' }, 403)
  }

  const branchRows = await loadSubmissionRows(db, sub.id)
  if (branchRows.length > 0) return c.json(branchRows)

  const allRows  = await loadRoundRows(db, sub.roundCompanyId)
  const scope    = JSON.parse(sub.scope) as SubmissionScope
  const scopeIds = new Set(resolveScope(scope, allRows))

  if (sub.parentId) {
    const parentRows = await loadSubmissionRows(db, sub.parentId)
    if (parentRows.length > 0) return c.json(parentRows.filter(r => scopeIds.has(r.rowId)))
  }
  return c.json(allRows.filter(r => scopeIds.has(r.rowId)))
})

// ── 行保存 ───────────────────────────────────────────────────────────────────

app.put('/:id/rows', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id) {
    return c.json({ error: '権限がありません' }, 403)
  }
  if (['submitted', 'merged', 'accepted'].includes(sub.status)) {
    return c.json({ error: '提出済み・マージ済みの Submission は編集できません' }, 409)
  }

  const rows     = await c.req.json<AllocationRow[]>()
  const allRows  = await loadRoundRows(db, sub.roundCompanyId)
  const scope    = JSON.parse(sub.scope) as SubmissionScope
  const scopeIds = new Set(resolveScope(scope, allRows))

  const outOfScope = rows.filter(r => !scopeIds.has(r.rowId))
  if (outOfScope.length > 0) {
    return c.json({ error: `スコープ外の行が含まれています: ${outOfScope.map(r => r.rowId).join(', ')}` }, 400)
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(submissionRows)
        .values({ submissionId: sub.id, rowId: row.rowId, data: JSON.stringify(row) })
        .onConflictDoUpdate({
          target: [submissionRows.submissionId, submissionRows.rowId],
          set:    { data: sql`excluded.data`, updatedAt: sql`now()` as unknown as string },
        })
    }
  })

  if (sub.status === 'pending') {
    await db.update(submissions)
      .set({ status: 'in_progress', updatedAt: sql`now()` as unknown as string })
      .where(eq(submissions.id, sub.id))
  }

  return c.json({ saved: rows.length })
})

// ── 提出 ─────────────────────────────────────────────────────────────────────

app.post('/:id/submit', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id) {
    return c.json({ error: '権限がありません' }, 403)
  }
  if (['submitted', 'merged'].includes(sub.status)) {
    return c.json({ error: '既に提出済みまたはマージ済みです' }, 409)
  }

  const body  = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }))
  const force = body.force ?? false

  if (force) {
    await forceCancelDescendants(db, sub.id)
  } else {
    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(submissions)
      .where(and(
        eq(submissions.parentId, sub.id),
        notInArray(submissions.status, ['merged', 'cancelled']),
      ))
    if (pendingCount > 0) {
      return c.json({ error: `配下の Submission が ${pendingCount} 件未提出です` }, 409)
    }
  }

  const allRows  = await loadRoundRows(db, sub.roundCompanyId)
  const scope    = JSON.parse(sub.scope) as SubmissionScope
  const scopeIds = new Set(resolveScope(scope, allRows))
  const branchRows = await loadSubmissionRows(db, sub.id)
  const scopeRows  = branchRows.length > 0
    ? branchRows
    : allRows.filter(r => scopeIds.has(r.rowId))

  const issues = validateCrossRowConsistency(scopeRows)
  if (issues.length > 0) {
    return c.json({
      error:  `整合エラーが ${issues.length} 件あります`,
      issues: issues.map(i => ({ groupEmployeeId: i.groupEmployeeId, field: i.field, valueA: i.valueA, valueB: i.valueB })),
    }, 422)
  }

  await db.update(submissions)
    .set({ status: 'submitted', updatedAt: sql`now()` as unknown as string })
    .where(eq(submissions.id, sub.id))

  if (sub.parentId) {
    const [parent] = await db
      .select({ assigneeId: submissions.assigneeId })
      .from(submissions).where(eq(submissions.id, sub.parentId)).limit(1)
    if (parent) {
      await db.insert(notifications).values({
        recipientId: parent.assigneeId,
        template:    'submission',
        payload:     JSON.stringify({ submissionId: sub.id }),
      })
    }
  }

  return c.json({ status: 'submitted' })
})

// ── 手動マージ ────────────────────────────────────────────────────────────────

app.post('/:id/merge', requireRole('admin', 'coordinator'), async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)

  if (user.role !== 'admin') {
    if (!sub.parentId) return c.json({ error: '最上位 Submission はマージ不要です' }, 400)
    const [parent] = await db
      .select({ assigneeId: submissions.assigneeId })
      .from(submissions).where(eq(submissions.id, sub.parentId)).limit(1)
    if (!parent || parent.assigneeId !== user.id) {
      return c.json({ error: '直接の依頼元のみマージできます' }, 403)
    }
  }
  if (sub.status !== 'submitted') {
    return c.json({ error: '提出済み（submitted）の Submission のみマージできます' }, 409)
  }

  const conflicts = await performMerge(db, sub)

  await db.update(submissions)
    .set({ status: 'merged', updatedAt: sql`now()` as unknown as string })
    .where(eq(submissions.id, sub.id))

  return c.json({ status: 'merged', conflicts })
})

// ── 途中取り込み（sync）──────────────────────────────────────────────────────

app.post('/:id/sync', requireRole('admin', 'coordinator'), async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)

  if (user.role !== 'admin') {
    if (!sub.parentId) return c.json({ error: '最上位 Submission は sync 不要です' }, 400)
    const [parent] = await db
      .select({ assigneeId: submissions.assigneeId })
      .from(submissions).where(eq(submissions.id, sub.parentId)).limit(1)
    if (!parent || parent.assigneeId !== user.id) {
      return c.json({ error: '直接の依頼元のみ sync できます' }, 403)
    }
  }

  const conflicts = await performMerge(db, sub)
  return c.json({ conflicts })
})

// ── 配下差分 ─────────────────────────────────────────────────────────────────

app.get('/:id/child-diffs', async (c) => {
  const user = c.get('user')
  const db = await getDb()
  const [sub] = await db
    .select({ id: submissions.id, assigneeId: submissions.assigneeId })
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (user.role !== 'admin' && sub.assigneeId !== user.id)
    return c.json({ error: '権限がありません' }, 403)

  const children = await db
    .select({
      id:           submissions.id,
      assigneeId:   submissions.assigneeId,
      assigneeName: users.name,
      status:       submissions.status,
      snapshotData: submissions.snapshotData,
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.assigneeId, users.id))
    .where(eq(submissions.parentId, c.req.param('id')))
    .orderBy(submissions.createdAt)

  const childResults = await Promise.all(children.map(async (child) => {
    const snapshotRows: AllocationRow[] = child.snapshotData
      ? JSON.parse(child.snapshotData) as AllocationRow[]
      : []
    const currentRows = await loadSubmissionRows(db, child.id)
    const rows = currentRows.length > 0 ? currentRows : snapshotRows
    return {
      id:           child.id,
      assigneeId:   child.assigneeId,
      assigneeName: child.assigneeName,
      status:       child.status,
      diffs:        computeRowDiffs(snapshotRows, rows),
    }
  }))

  return c.json({ children: childResults })
})

// ── 差し戻し ─────────────────────────────────────────────────────────────────

app.post('/:id/request-revision', requireRole('admin', 'coordinator'), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ comment: string }>()
  if (!body.comment) return c.json({ error: 'comment は必須です' }, 400)

  const db = await getDb()
  const [sub] = await db
    .select()
    .from(submissions).where(eq(submissions.id, c.req.param('id'))).limit(1)
  if (!sub) return c.json({ error: 'Not found' }, 404)

  if (user.role !== 'admin') {
    if (!sub.parentId) return c.json({ error: '差し戻し対象が不正です' }, 400)
    const [parent] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.id, sub.parentId), eq(submissions.assigneeId, user.id)))
      .limit(1)
    if (!parent) return c.json({ error: '直接の依頼元のみ差し戻せます' }, 403)
  }

  if (sub.status !== 'submitted') {
    return c.json({ error: '提出済み（submitted）の Submission のみ差し戻せます' }, 409)
  }

  await db.update(submissions)
    .set({
      status:          'revision_requested',
      revisionComment: body.comment,
      updatedAt:       sql`now()` as unknown as string,
    })
    .where(eq(submissions.id, sub.id))

  await db.insert(notifications).values({
    recipientId: sub.assigneeId,
    template:    'revision_request',
    payload:     JSON.stringify({ submissionId: sub.id, comment: body.comment }),
  })

  return c.json({ status: 'revision_requested' })
})

export default app
