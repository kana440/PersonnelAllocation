import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../db/database.ts'
import { positions } from '../../db/schema.ts'
import type { AuthVariables } from '../../auth/index.ts'

const app = new Hono<{ Variables: AuthVariables }>()

const SF_CODE = /^P\d{8}$/

const bulkRegisterSchema = z.object({
  codes: z.array(z.string().regex(SF_CODE, 'P + 8桁の形式（例: P00001234）で入力してください')).min(1),
})

const positionUpdateSchema = z.object({
  status:     z.enum(['available', 'in_use', 'retired']).optional(),
  acquiredBy: z.string().nullable().optional(),
  acquiredAt: z.string().nullable().optional(),
  notes:      z.string().nullable().optional(),
})

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
  registered: string[]
  skipped:    string[]
}

function toAdminPosition(row: typeof positions.$inferSelect): AdminPosition {
  return {
    code:         row.code,
    status:       row.status as 'available' | 'in_use' | 'retired',
    acquiredBy:   row.acquiredBy,
    acquiredAt:   row.acquiredAt,
    notes:        row.notes,
    registeredBy: row.registeredBy,
    registeredAt: row.registeredAt,
    updatedAt:    row.updatedAt,
  }
}

// ポジション一覧（status でフィルタ可能）
app.get('/', async (c) => {
  const db = await getDb()
  const status = c.req.query('status')
  const rows = status
    ? await db.select().from(positions).where(eq(positions.status, status)).orderBy(positions.code)
    : await db.select().from(positions).orderBy(positions.status, positions.code)
  return c.json(rows.map(toAdminPosition))
})

// ステータス別件数サマリ
app.get('/summary', async (c) => {
  const db = await getDb()
  const rows = await db
    .select({ status: positions.status, count: sql<number>`COUNT(*)::int` })
    .from(positions)
    .groupBy(positions.status)
  const summary = { available: 0, in_use: 0, retired: 0 }
  rows.forEach(r => {
    if (r.status in summary) summary[r.status as keyof typeof summary] = r.count
  })
  return c.json(summary)
})

// 一括登録
app.post('/bulk', zValidator('json', bulkRegisterSchema), async (c) => {
  const user = c.get('user')
  const { codes } = c.req.valid('json')
  const db = await getDb()

  const registered: string[] = []
  const skipped: string[] = []

  await db.transaction(async (tx) => {
    for (const code of codes) {
      const result = await tx
        .insert(positions)
        .values({ code, registeredBy: user.id })
        .onConflictDoNothing()
      // PGlite の onConflictDoNothing は rowsAffected を返す
      if ((result as unknown as { rowCount: number }).rowCount > 0) registered.push(code)
      else skipped.push(code)
    }
  })

  return c.json({ registered, skipped } satisfies BulkRegisterResult, 201)
})

// ポジション更新
app.put('/:code', zValidator('json', positionUpdateSchema), async (c) => {
  const code = c.req.param('code')
  const body = c.req.valid('json')
  const db = await getDb()

  const [existing] = await db
    .select({ code: positions.code })
    .from(positions)
    .where(eq(positions.code, code))
    .limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const patch: Partial<typeof positions.$inferInsert> = { updatedAt: sql`now()` as unknown as string }
  if (body.status     !== undefined) patch.status     = body.status
  if (body.acquiredBy !== undefined) patch.acquiredBy = body.acquiredBy
  if (body.acquiredAt !== undefined) patch.acquiredAt = body.acquiredAt
  if (body.notes      !== undefined) patch.notes      = body.notes

  await db.update(positions).set(patch).where(eq(positions.code, code))

  const [updated] = await db.select().from(positions).where(eq(positions.code, code)).limit(1)
  return c.json(toAdminPosition(updated))
})

// プールから削除（available のみ）
app.delete('/:code', async (c) => {
  const code = c.req.param('code')
  const db = await getDb()

  const [row] = await db
    .select({ code: positions.code, status: positions.status })
    .from(positions)
    .where(eq(positions.code, code))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.status !== 'available') return c.json({ error: '利用可能状態のコードのみ削除できます' }, 409)

  await db.delete(positions).where(eq(positions.code, code))
  return c.body(null, 204)
})

export default app
