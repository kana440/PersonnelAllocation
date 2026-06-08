import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '../../db/database.ts'
import { skills } from '../../db/schema.ts'
import type { AuthVariables } from '../../auth/index.ts'

const app = new Hono<{ Variables: AuthVariables }>()

const VALID_STATUSES = ['active', 'disabled', 'draft'] as const
type SkillStatus = typeof VALID_STATUSES[number]

export interface ApiSkill {
  slug:         string
  name:         string
  description:  string
  instructions: string
  status:       SkillStatus
  isBuiltin:    boolean
  createdAt:    string
  updatedAt:    string
}

const upsertBodySchema = z.object({
  name:         z.string().min(1).max(120).optional(),
  description:  z.string().max(500).optional(),
  instructions: z.string().max(50000).optional(),
  status:       z.enum(VALID_STATUSES).optional(),
  isBuiltin:    z.boolean().optional(),
})

function rowToApi(row: typeof skills.$inferSelect): ApiSkill {
  return {
    slug:         row.slug,
    name:         row.name,
    description:  row.description,
    instructions: row.instructions,
    status:       row.status as SkillStatus,
    isBuiltin:    row.isBuiltin === 1,
    createdAt:    row.createdAt as string,
    updatedAt:    row.updatedAt as string,
  }
}

app.get('/', async (c) => {
  const db   = await getDb()
  const rows = await db.select().from(skills).orderBy(asc(skills.slug))
  return c.json(rows.map(rowToApi))
})

app.put('/:slug', zValidator('json', upsertBodySchema), async (c) => {
  const slug = c.req.param('slug')
  const body = c.req.valid('json')
  const db   = await getDb()
  const now  = new Date().toISOString()

  const [existing] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1)

  if (existing) {
    type Patch = Partial<typeof skills.$inferInsert>
    const patch: Patch = { updatedAt: now }
    if (body.name         !== undefined) patch.name         = body.name
    if (body.description  !== undefined) patch.description  = body.description
    if (body.instructions !== undefined) patch.instructions = body.instructions
    if (body.status       !== undefined) patch.status       = body.status
    if (body.isBuiltin    !== undefined) patch.isBuiltin    = body.isBuiltin ? 1 : 0
    await db.update(skills).set(patch).where(eq(skills.slug, slug))
  } else {
    await db.insert(skills).values({
      slug,
      name:         body.name         ?? slug,
      description:  body.description  ?? '',
      instructions: body.instructions ?? '',
      status:       body.status       ?? 'draft',
      isBuiltin:    body.isBuiltin ? 1 : 0,
      createdAt:    now,
      updatedAt:    now,
    })
  }

  const [updated] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1)
  return c.json(rowToApi(updated!))
})

app.delete('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db   = await getDb()
  const [existing] = await db.select({ slug: skills.slug }).from(skills)
    .where(eq(skills.slug, slug)).limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(skills).where(eq(skills.slug, slug))
  return c.body(null, 204)
})

export default app
