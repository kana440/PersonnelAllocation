// 認証モジュール
//
// dev:  X-User-Id ヘッダー（既存の動作を維持）または JWT Cookie
// prod: JWT Cookie のみ（SAML callback で issueToken() を呼んで発行）

import { createMiddleware } from 'hono/factory'
import { sign, verify } from 'hono/jwt'
import { getCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/database.ts'
import { users } from '../db/schema.ts'

export type UserRole = 'admin' | 'coordinator' | 'member'

export interface AuthUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
}

export type AuthVariables = { user: AuthUser }

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-production'
}

// JWT 発行（SAML callback / stub-login から呼ぶ）
export async function issueToken(user: AuthUser): Promise<string> {
  return sign(
    { id: user.id, name: user.name, email: user.email, role: user.role,
      exp: Math.floor(Date.now() / 1000) + 28800 },  // 8h
    jwtSecret(),
  )
}

// DB からユーザーを取得
export async function resolveUserById(userId: string): Promise<AuthUser | null> {
  const db = await getDb()
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users).where(eq(users.id, userId)).limit(1)
  return row ? (row as AuthUser) : null
}

// デモ UI 用ユーザー一覧
export async function listAuthUsers(): Promise<AuthUser[]> {
  const db = await getDb()
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
  return rows as AuthUser[]
}

// 認証ミドルウェア
// dev:  X-User-Id ヘッダー優先（既存フロントエンドとの互換性維持）→ JWT Cookie も可
// prod: JWT Cookie のみ（NODE_ENV=production のとき X-User-Id を無視）
export const authenticated = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  // Dev ショートカット: X-User-Id ヘッダー
  if (process.env.NODE_ENV !== 'production') {
    const stubId = c.req.header('X-User-Id')
    if (stubId) {
      const user = await resolveUserById(stubId)
      if (user) { c.set('user', user); await next(); return }
    }
  }

  // JWT Cookie
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: '認証が必要です' }, 401)

  try {
    const payload = await verify(token, jwtSecret(), 'HS256')
    c.set('user', payload as unknown as AuthUser)
    await next()
  } catch {
    return c.json({ error: 'セッションが無効です。再ログインしてください' }, 401)
  }
})

// ロール確認ミドルウェア（authenticated の後に使う）
export function requireRole(...roles: UserRole[]) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) return c.json({ error: '権限がありません' }, 403)
    await next()
  })
}
