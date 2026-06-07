import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/database.ts'
import { users, userCompanyRoles } from '../db/schema.ts'

export type UserRole = 'admin' | 'coordinator' | 'member'

export interface AuthUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
}

export type AppEnv = {
  Variables: {
    user: AuthUser
  }
}

export async function resolveUser(userId: string | undefined): Promise<AuthUser | null> {
  if (!userId) return null
  const db = await getDb()
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row ? (row as AuthUser) : null
}

export interface AccessPolicy {
  orgLevelMin: number | null
  orgCodes:    string[] | null
}

export async function getAccessPolicy(userId: string, companyId?: string): Promise<AccessPolicy> {
  if (!companyId) return { orgLevelMin: null, orgCodes: null }
  const db = await getDb()
  const [row] = await db
    .select({
      orgLevelMin: userCompanyRoles.orgLevelMin,
      orgCodes:    userCompanyRoles.orgCodes,
    })
    .from(userCompanyRoles)
    .where(eq(userCompanyRoles.userId, userId))
    .limit(1)
  if (!row) return { orgLevelMin: null, orgCodes: null }
  return {
    orgLevelMin: row.orgLevelMin ?? null,
    orgCodes:    row.orgCodes ? JSON.parse(row.orgCodes) as string[] : null,
  }
}

export async function listUsers(): Promise<AuthUser[]> {
  const db = await getDb()
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
  return rows as AuthUser[]
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = await resolveUser(c.req.header('X-User-Id'))
  if (!user) return c.json({ error: 'X-User-Id ヘッダーが必要です' }, 401)
  c.set('user', user)
  await next()
})

export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: '権限がありません' }, 403)
    }
    await next()
  })
}
