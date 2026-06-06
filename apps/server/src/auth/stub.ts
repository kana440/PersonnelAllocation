import { createMiddleware } from 'hono/factory'
import { getDb } from '../db/sqlite.ts'

export type UserRole = 'super_admin' | 'admin' | 'assignee'

export interface AuthUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
}

// Hono の型付き変数定義
export type AppEnv = {
  Variables: {
    user: AuthUser
  }
}

// デモ用スタブ認証: X-User-Id ヘッダーでユーザーを切り替えるだけ。
export function resolveUser(userId: string | undefined): AuthUser | null {
  if (!userId) return null
  const db = getDb()
  const row = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId) as AuthUser | undefined
  return row ?? null
}

export interface AccessPolicy {
  orgLevelMin: number | null
  orgCodes:    string[] | null
}

export function getAccessPolicy(userId: string): AccessPolicy {
  const db = getDb()
  const row = db.prepare(
    'SELECT org_level_min, org_codes FROM user_access_policies WHERE user_id = ?'
  ).get(userId) as { org_level_min: number | null; org_codes: string | null } | undefined

  if (!row) return { orgLevelMin: null, orgCodes: null }
  return {
    orgLevelMin: row.org_level_min,
    orgCodes:    row.org_codes ? JSON.parse(row.org_codes) as string[] : null,
  }
}

export function listUsers(): AuthUser[] {
  const db = getDb()
  return db.prepare('SELECT id, name, email, role FROM users').all() as AuthUser[]
}

// 認証ミドルウェア
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.req.header('X-User-Id')
  const user = resolveUser(userId)
  if (!user) return c.json({ error: 'X-User-Id ヘッダーが必要です' }, 401)
  c.set('user', user)
  await next()
})

// ロールチェックミドルウェア
export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: '権限がありません' }, 403)
    }
    await next()
  })
}
