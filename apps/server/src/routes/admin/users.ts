import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getDb } from '../../db/sqlite.ts'
import type { UserRole, AppEnv } from '../../auth/stub.ts'
import { randomUUID } from 'crypto'

const app = new Hono<AppEnv>()

// ── スキーマ ────────────────────────────────────────────────────

const VALID_ROLES = ['super_admin', 'admin', 'assignee'] as const

const userBodySchema = z.object({
  name:        z.string().min(1, '名前は必須です'),
  email:       z.string().email('有効なメールアドレスを入力してください'),
  role:        z.enum(VALID_ROLES),
  orgLevelMin: z.number().int().positive().nullable().optional(),
  orgCodes:    z.array(z.string()).nullable().optional(),
})

const userUpdateSchema = userBodySchema.partial()

// ── 型定義 ──────────────────────────────────────────────────────

export interface AdminUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
  policy: {
    orgLevelMin: number | null
    orgCodes:    string[] | null
  }
}

// ── ヘルパー ────────────────────────────────────────────────────

function fetchUser(id: string): AdminUser | null {
  const db = getDb()
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) as
    { id: string; name: string; email: string; role: UserRole } | undefined
  if (!user) return null

  const policy = db.prepare(
    'SELECT org_level_min, org_codes FROM user_access_policies WHERE user_id = ?'
  ).get(id) as { org_level_min: number | null; org_codes: string | null } | undefined

  return {
    ...user,
    policy: {
      orgLevelMin: policy?.org_level_min ?? null,
      orgCodes:    policy?.org_codes ? JSON.parse(policy.org_codes) as string[] : null,
    },
  }
}

function upsertPolicy(userId: string, orgLevelMin: number | null, orgCodes: string[] | null) {
  const db = getDb()
  const orgCodesJson = orgCodes ? JSON.stringify(orgCodes) : null
  const existing = db.prepare('SELECT user_id FROM user_access_policies WHERE user_id = ?').get(userId)
  if (existing) {
    db.prepare(
      'UPDATE user_access_policies SET org_level_min = ?, org_codes = ? WHERE user_id = ?'
    ).run(orgLevelMin, orgCodesJson, userId)
  } else {
    db.prepare(
      'INSERT INTO user_access_policies (user_id, org_level_min, org_codes) VALUES (?, ?, ?)'
    ).run(userId, orgLevelMin, orgCodesJson)
  }
}

// ── ルート ──────────────────────────────────────────────────────

app.get('/', (c) => {
  const db = getDb()
  const users = db.prepare('SELECT id, name, email, role FROM users ORDER BY name').all() as
    Array<{ id: string; name: string; email: string; role: UserRole }>

  const result: AdminUser[] = users.map(u => {
    const policy = db.prepare(
      'SELECT org_level_min, org_codes FROM user_access_policies WHERE user_id = ?'
    ).get(u.id) as { org_level_min: number | null; org_codes: string | null } | undefined
    return {
      ...u,
      policy: {
        orgLevelMin: policy?.org_level_min ?? null,
        orgCodes:    policy?.org_codes ? JSON.parse(policy.org_codes) as string[] : null,
      },
    }
  })
  return c.json(result)
})

app.post('/', zValidator('json', userBodySchema), (c) => {
  const { name, email, role, orgLevelMin = null, orgCodes = null } = c.req.valid('json')
  const db = getDb()
  const id = randomUUID()
  db.prepare('INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)').run(id, name, email, role)
  upsertPolicy(id, orgLevelMin ?? null, orgCodes ?? null)
  return c.json(fetchUser(id)!, 201)
})

app.get('/:id', (c) => {
  const user = fetchUser(c.req.param('id'))
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json(user)
})

app.put('/:id', zValidator('json', userUpdateSchema), async (c) => {
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const { name, email, role, orgLevelMin, orgCodes } = body

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (name || email || role) {
    const sets: string[] = []
    const vals: unknown[] = []
    if (name)  { sets.push('name = ?');  vals.push(name) }
    if (email) { sets.push('email = ?'); vals.push(email) }
    if (role)  { sets.push('role = ?');  vals.push(role) }
    vals.push(id)
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }

  if (orgLevelMin !== undefined || orgCodes !== undefined) {
    const current = fetchUser(id)!.policy
    upsertPolicy(
      id,
      orgLevelMin !== undefined ? (orgLevelMin ?? null) : current.orgLevelMin,
      orgCodes    !== undefined ? (orgCodes    ?? null) : current.orgCodes,
    )
  }

  return c.json(fetchUser(id)!)
})

app.delete('/:id', (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const inUse = db.prepare('SELECT id FROM sessions WHERE created_by = ? LIMIT 1').get(id)
  if (inUse) return c.json({ error: 'このユーザーはセッションで使用中のため削除できません' }, 409)

  db.prepare('DELETE FROM user_access_policies WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return c.body(null, 204)
})

export default app
