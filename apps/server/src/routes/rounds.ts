import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc, sql, count, and } from 'drizzle-orm'
import { getDb } from '../db/database.ts'
import {
  rounds, roundCompanies, roundCompanyFiles, roundCompanyOrgs,
  roundCompanyCodeItems, allocationRows, submissions, users, companies,
} from '../db/schema.ts'
import { authenticated, requireRole } from '../auth/index.ts'
import type { AuthVariables } from '../auth/index.ts'
import { randomUUID } from 'crypto'
import type { AllocationRow } from '@personnel/domain/allocationRow'

const createRoundSchema = z.object({
  label:               z.string().min(1, 'ラウンド名は必須です'),
  kind:                z.enum(['annual', 'patch']).default('annual'),
  companyId:           z.string().min(1, 'companyId は必須です'),
  basedOnRoundId:      z.string().optional(),
  rows:                z.array(z.unknown()).optional(),
  beforeOrganizations: z.array(z.unknown()).optional(),
  afterOrganizations:  z.array(z.unknown()).optional(),
  codeLists:           z.record(z.string(), z.array(z.unknown())).optional(),
  excelBase64:         z.string().optional(),
  excelFilename:       z.string().optional(),
})

const app = new Hono<{ Variables: AuthVariables }>()
app.use('*', authenticated)

// ── Round 一覧 ───────────────────────────────────────────────────────────────

app.get('/', requireRole('admin', 'coordinator'), async (c) => {
  const db = await getDb()
  const rows = await db
    .select({
      id:                rounds.id,
      label:             rounds.label,
      kind:              rounds.kind,
      status:            rounds.status,
      based_on_round_id: rounds.basedOnRoundId,
      created_at:        rounds.createdAt,
      created_by_name:   users.name,
      company_count:     sql<number>`(
        SELECT COUNT(*)::int FROM round_companies rc WHERE rc.round_id = ${rounds.id}
      )`,
    })
    .from(rounds)
    .leftJoin(users, eq(rounds.createdBy, users.id))
    .orderBy(desc(rounds.createdAt))
  return c.json(rows)
})

// ── Round 作成（Round + RoundCompany を同時作成）────────────────────────────

app.post('/', requireRole('admin'), zValidator('json', createRoundSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  const db = await getDb()

  const [company] = await db
    .select({ id: companies.id })
    .from(companies).where(eq(companies.id, body.companyId)).limit(1)
  if (!company) return c.json({ error: '指定した Company が見つかりません' }, 400)

  if (body.basedOnRoundId) {
    const [baseRound] = await db
      .select({ id: rounds.id })
      .from(rounds).where(eq(rounds.id, body.basedOnRoundId)).limit(1)
    if (!baseRound) return c.json({ error: '指定した basedOnRoundId が見つかりません' }, 400)
  }

  const roundId        = randomUUID()
  const roundCompanyId = randomUUID()

  await db.transaction(async (tx) => {
    // Round（グループレベル）
    await tx.insert(rounds).values({
      id: roundId, label: body.label,
      kind:           body.kind ?? 'annual',
      basedOnRoundId: body.basedOnRoundId ?? null,
      createdBy:      user.id,
    })

    // RoundCompany（Round × Company）
    await tx.insert(roundCompanies).values({
      id: roundCompanyId, roundId, companyId: body.companyId,
      status: 'in_progress',
    })

    // AllocationRows（前回 Round の行を引き継ぐ、または直接指定）
    const sourceRows: AllocationRow[] = (body.rows as AllocationRow[] | undefined) ?? []
    if (sourceRows.length === 0 && body.basedOnRoundId) {
      // 前回 Round の同社データを引き継ぐ
      const [prevRc] = await tx
        .select({ id: roundCompanies.id })
        .from(roundCompanies)
        .where(and(
          eq(roundCompanies.roundId, body.basedOnRoundId),
          eq(roundCompanies.companyId, body.companyId),
        ))
        .limit(1)
      if (prevRc) {
        const prevRows = await tx
          .select({ rowId: allocationRows.rowId, data: allocationRows.data })
          .from(allocationRows)
          .where(eq(allocationRows.roundCompanyId, prevRc.id))
        if (prevRows.length > 0) {
          await tx.insert(allocationRows).values(
            prevRows.map(r => ({ roundCompanyId, rowId: r.rowId, data: r.data }))
          )
        }
      }
    } else if (sourceRows.length > 0) {
      await tx.insert(allocationRows).values(
        sourceRows.map(row => ({
          roundCompanyId, rowId: row.rowId, data: JSON.stringify(row),
        }))
      )
    }

    // 組織スナップショット（before/after）
    // externalCode が無いエントリ（未設定組織など）は departmentCode と紐づかないためスキップ
    if (body.beforeOrganizations) {
      const orgs = body.beforeOrganizations as Array<{
        externalCode?: string; name: string; parentCode?: string; level?: number
      }>
      for (const org of orgs) {
        if (!org.externalCode) continue
        await tx.insert(roundCompanyOrgs).values({
          roundCompanyId, isAfter: false,
          externalCode: org.externalCode, name: org.name,
          level: org.level ?? 0, path: '/',
        })
      }
    }
    if (body.afterOrganizations) {
      const orgs = body.afterOrganizations as Array<{
        externalCode?: string; name: string; parentCode?: string; level?: number
      }>
      for (const org of orgs) {
        if (!org.externalCode) continue
        await tx.insert(roundCompanyOrgs).values({
          roundCompanyId, isAfter: true,
          externalCode: org.externalCode, name: org.name,
          level: org.level ?? 0, path: '/',
        })
      }
    }

    // コードリスト
    // orgMasterEntries は組織マスタ（label 非保持・roundCompanyOrgs 管理）なので除外
    if (body.codeLists) {
      for (const [category, items] of Object.entries(body.codeLists)) {
        if (category === 'orgMasterEntries') continue
        const codeItems = items as Array<{ code?: string; label?: string; name?: string; [k: string]: unknown }>
        for (let i = 0; i < codeItems.length; i++) {
          const item = codeItems[i]
          const label = item.label ?? item.name
          if (!label) continue  // label が取れないエントリはスキップ
          const { label: _l, name: _n, code, ...rest } = item
          await tx.insert(roundCompanyCodeItems).values({
            roundCompanyId, category,
            code:       (code as string | undefined) ?? label,
            label,
            sortOrder:  i,
            attributes: Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
          })
        }
      }
    }

    // Excel ファイル
    if (body.excelBase64 && body.excelFilename) {
      const size = Buffer.from(body.excelBase64, 'base64').length
      await tx.insert(roundCompanyFiles).values({
        roundCompanyId, filename: body.excelFilename, data: body.excelBase64, size,
      })
    }
  })

  const [{ rowCount }] = await db
    .select({ rowCount: count() })
    .from(allocationRows)
    .where(eq(allocationRows.roundCompanyId, roundCompanyId))

  await db.update(rounds)
    .set({ status: 'in_progress', updatedAt: sql`now()` as unknown as string })
    .where(eq(rounds.id, roundId))

  return c.json({ id: roundId, roundCompanyId, label: body.label, status: 'in_progress', rowCount }, 201)
})

// ── Round 詳細 ───────────────────────────────────────────────────────────────

app.get('/:id', requireRole('admin', 'coordinator'), async (c) => {
  const db = await getDb()
  const [round] = await db
    .select({
      id:                rounds.id,
      label:             rounds.label,
      kind:              rounds.kind,
      status:            rounds.status,
      based_on_round_id: rounds.basedOnRoundId,
      created_at:        rounds.createdAt,
      updated_at:        rounds.updatedAt,
      created_by_name:   users.name,
    })
    .from(rounds)
    .leftJoin(users, eq(rounds.createdBy, users.id))
    .where(eq(rounds.id, c.req.param('id')))
    .limit(1)
  if (!round) return c.json({ error: 'Not found' }, 404)
  return c.json(round)
})

// ── Round ステータス・ラベル更新 ─────────────────────────────────────────────

app.patch('/:id', requireRole('admin'), async (c) => {
  const body = await c.req.json<{ status?: string; label?: string }>()
  const db = await getDb()
  const [round] = await db
    .select({ id: rounds.id })
    .from(rounds).where(eq(rounds.id, c.req.param('id'))).limit(1)
  if (!round) return c.json({ error: 'Not found' }, 404)

  const patch: Partial<typeof rounds.$inferInsert> = { updatedAt: sql`now()` as unknown as string }
  if (body.status) patch.status = body.status
  if (body.label)  patch.label  = body.label
  await db.update(rounds).set(patch).where(eq(rounds.id, round.id))
  return c.json({ id: round.id })
})

// ── Round 内の Company 一覧 ──────────────────────────────────────────────────

app.get('/:id/companies', requireRole('admin', 'coordinator'), async (c) => {
  const db = await getDb()
  const rcs = await db
    .select({
      id:           roundCompanies.id,
      round_id:     roundCompanies.roundId,
      company_id:   roundCompanies.companyId,
      company_name: companies.name,
      company_code: companies.code,
      status:       roundCompanies.status,
      row_count: sql<number>`(
        SELECT COUNT(*)::int FROM allocation_rows ar WHERE ar.round_company_id = ${roundCompanies.id}
      )`,
    })
    .from(roundCompanies)
    .leftJoin(companies, eq(roundCompanies.companyId, companies.id))
    .where(eq(roundCompanies.roundId, c.req.param('id')))
    .orderBy(roundCompanies.createdAt)
  return c.json(rcs)
})

// ── 組織マスタ・コードリスト取得（company ごと）──────────────────────────────

app.get('/:id/companies/:companyId/masters', requireRole('admin', 'coordinator', 'member'), async (c) => {
  const db = await getDb()
  const [rc] = await db
    .select({ id: roundCompanies.id })
    .from(roundCompanies)
    .where(and(
      eq(roundCompanies.roundId, c.req.param('id')),
      eq(roundCompanies.companyId, c.req.param('companyId')),
    ))
    .limit(1)
  if (!rc) return c.json({ error: 'Round × Company が見つかりません' }, 404)

  const [orgs, codeItems] = await Promise.all([
    db.select().from(roundCompanyOrgs).where(eq(roundCompanyOrgs.roundCompanyId, rc.id)),
    db.select().from(roundCompanyCodeItems).where(eq(roundCompanyCodeItems.roundCompanyId, rc.id)),
  ])

  const beforeOrganizations = orgs.filter(o => !o.isAfter)
  const afterOrganizations  = orgs.filter(o => o.isAfter)

  const codeLists: Record<string, unknown[]> = {}
  for (const item of codeItems) {
    if (!codeLists[item.category]) codeLists[item.category] = []
    codeLists[item.category].push({
      code:      item.code,
      label:     item.label,
      sortOrder: item.sortOrder,
      ...(item.attributes ? JSON.parse(item.attributes) as object : {}),
    })
  }

  return c.json({ beforeOrganizations, afterOrganizations, codeLists })
})

// ── Excel ダウンロード（company ごと）────────────────────────────────────────

app.get('/:id/companies/:companyId/excel', requireRole('admin', 'coordinator', 'member'), async (c) => {
  const db = await getDb()
  const [rc] = await db
    .select({ id: roundCompanies.id })
    .from(roundCompanies)
    .where(and(
      eq(roundCompanies.roundId, c.req.param('id')),
      eq(roundCompanies.companyId, c.req.param('companyId')),
    ))
    .limit(1)
  if (!rc) return c.json({ error: 'Round × Company が見つかりません' }, 404)

  const [file] = await db
    .select({ filename: roundCompanyFiles.filename, data: roundCompanyFiles.data })
    .from(roundCompanyFiles)
    .where(eq(roundCompanyFiles.roundCompanyId, rc.id))
    .limit(1)
  if (!file) return c.json({ error: 'Excel ファイルが見つかりません' }, 404)

  const buf = Buffer.from(file.data, 'base64')
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`)
  return c.body(new Uint8Array(buf).buffer as ArrayBuffer)
})

// ── Round 確定（status を merged に更新） ────────────────────────────────────

app.post('/:id/finalize', requireRole('admin'), async (c) => {
  const db = await getDb()
  const [round] = await db
    .select({ id: rounds.id, status: rounds.status })
    .from(rounds).where(eq(rounds.id, c.req.param('id'))).limit(1)
  if (!round) return c.json({ error: 'Not found' }, 404)

  await db.transaction(async (tx) => {
    await tx.update(roundCompanies)
      .set({ status: 'merged', updatedAt: sql`now()` as unknown as string })
      .where(eq(roundCompanies.roundId, round.id))
    await tx.update(rounds)
      .set({ status: 'merged', updatedAt: sql`now()` as unknown as string })
      .where(eq(rounds.id, round.id))
  })

  const [{ rowCount }] = await db
    .select({ rowCount: count() })
    .from(allocationRows)
    .leftJoin(roundCompanies, eq(allocationRows.roundCompanyId, roundCompanies.id))
    .where(eq(roundCompanies.roundId, round.id))

  return c.json({ status: 'merged', rowCount })
})

// ── 提出状況ダッシュボード（委任ツリー）──────────────────────────────────────

app.get('/:id/tree', requireRole('admin'), async (c) => {
  const db = await getDb()
  const [round] = await db
    .select({ id: rounds.id })
    .from(rounds).where(eq(rounds.id, c.req.param('id'))).limit(1)
  if (!round) return c.json({ error: 'Not found' }, 404)

  const subs = await db
    .select({
      id:               submissions.id,
      round_company_id: submissions.roundCompanyId,
      parent_id:        submissions.parentId,
      assignee_id:      submissions.assigneeId,
      scope:            submissions.scope,
      status:           submissions.status,
      request_comment:  submissions.requestComment,
      revision_comment: submissions.revisionComment,
      created_at:       submissions.createdAt,
      updated_at:       submissions.updatedAt,
      assignee_name:    users.name,
      company_id:       roundCompanies.companyId,
      row_count: sql<number>`(
        SELECT COUNT(*)::int FROM submission_rows sr WHERE sr.submission_id = ${submissions.id}
      )`,
    })
    .from(submissions)
    .leftJoin(users,          eq(submissions.assigneeId, users.id))
    .leftJoin(roundCompanies, eq(submissions.roundCompanyId, roundCompanies.id))
    .where(eq(roundCompanies.roundId, c.req.param('id')))
    .orderBy(submissions.createdAt)

  return c.json(subs)
})

export default app
