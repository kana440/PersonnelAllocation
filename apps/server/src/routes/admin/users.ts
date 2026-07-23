import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '../../db/database.ts'
import { users, userCompanyRoles } from '../../db/schema.ts'
import type { UserRole, AuthVariables } from '../../auth/index.ts'
import { randomUUID } from 'crypto'

const VALID_ROLES = ['admin', 'coordinator', 'member'] as const

const userBodySchema = z.object({
  name:        z.string().min(1),
  email:       z.string().email(),
  role:        z.enum(VALID_ROLES),
  orgLevelMin: z.number().int().positive().nullable().optional(),
  orgCodes:    z.array(z.string()).nullable().optional(),
})

const userUpdateSchema = userBodySchema.partial()

export interface AdminUser {
  id:     string
  name:   string
  email:  string
  role:   UserRole
}

async function fetchUser(id: string): Promise<AdminUser | null> {
  const db = await getDb()
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users).where(eq(users.id, id)).limit(1)
  if (!user) return null
  return { ...user, role: user.role as UserRole }
}

// RPC（hc<AppType>）で型推論できるよう、ルート登録は1つのチェーンにする（auth.ts参照）。
const app = new Hono<{ Variables: AuthVariables }>()
  .get('/', async (c) => {
    const db = await getDb()
    const all = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).orderBy(asc(users.name))
    return c.json(all.map(u => ({ ...u, role: u.role as UserRole })))
  })

  .post('/', zValidator('json', userBodySchema), async (c) => {
    const { name, email, role } = c.req.valid('json')
    const db = await getDb()
    const id = randomUUID()
    await db.insert(users).values({ id, name, email, role })
    return c.json((await fetchUser(id))!, 201)
  })

  .get('/:id', async (c) => {
    const user = await fetchUser(c.req.param('id'))
    if (!user) return c.json({ error: 'Not found' }, 404)
    return c.json(user)
  })

  .put('/:id', zValidator('json', userUpdateSchema), async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const db = await getDb()
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!existing) return c.json({ error: 'Not found' }, 404)

    const patch: Partial<{ name: string; email: string; role: string }> = {}
    if (body.name)  patch.name  = body.name
    if (body.email) patch.email = body.email
    if (body.role)  patch.role  = body.role
    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, id))
    }
    return c.json((await fetchUser(id))!)
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const db = await getDb()
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!existing) return c.json({ error: 'Not found' }, 404)
    // user_company_roles は CASCADE で自動削除される
    await db.delete(users).where(eq(users.id, id))
    return c.body(null, 204)
  })

  // ── 会社ロール管理 ────────────────────────────────────────────────────────
  .get('/:id/company-roles', async (c) => {
    const db = await getDb()
    const roles = await db
      .select()
      .from(userCompanyRoles)
      .where(eq(userCompanyRoles.userId, c.req.param('id')))
    return c.json(roles)
  })

  .put('/:id/company-roles/:companyId', async (c) => {
    const { id, companyId } = c.req.param()
    const body = await c.req.json<{ role: string; orgLevelMin?: number | null; orgCodes?: string[] | null }>()
    const db = await getDb()
    await db.insert(userCompanyRoles)
      .values({
        userId:      id,
        companyId,
        role:        body.role,
        orgLevelMin: body.orgLevelMin ?? null,
        orgCodes:    body.orgCodes ? JSON.stringify(body.orgCodes) : null,
      })
      .onConflictDoUpdate({
        target: [userCompanyRoles.userId, userCompanyRoles.companyId],
        set: {
          role:        body.role,
          orgLevelMin: body.orgLevelMin ?? null,
          orgCodes:    body.orgCodes ? JSON.stringify(body.orgCodes) : null,
        },
      })
    return c.json({ ok: true })
  })

  .delete('/:id/company-roles/:companyId', async (c) => {
    const { id } = c.req.param()
    const db = await getDb()
    await db.delete(userCompanyRoles)
      .where(eq(userCompanyRoles.userId, id))
    return c.body(null, 204)
  })

export default app
