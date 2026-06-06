import { Hono } from 'hono'
import { getDb } from '../db/sqlite.ts'
import { authMiddleware } from '../auth/stub.ts'
import type { AppEnv } from '../auth/stub.ts'
import { randomUUID } from 'crypto'

const app = new Hono<AppEnv>()

app.use('*', authMiddleware)

// セッション一覧
app.get('/', (c) => {
  const db = getDb()
  const sessions = db.prepare(
    'SELECT id, name, status, created_by, created_at FROM sessions ORDER BY created_at DESC'
  ).all()
  return c.json(sessions)
})

// セッション作成
app.post('/', async (c) => {
  const user = c.get('user')
  const { name } = await c.req.json<{ name: string }>()
  if (!name) return c.json({ error: 'name は必須です' }, 400)

  const db = getDb()
  const id = randomUUID()
  db.prepare(
    'INSERT INTO sessions (id, name, created_by) VALUES (?, ?, ?)'
  ).run(id, name, user.id)

  return c.json({ id, name, status: 'draft', created_by: user.id }, 201)
})

// セッション詳細
app.get('/:id', (c) => {
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(c.req.param('id'))
  if (!session) return c.json({ error: 'Not found' }, 404)
  return c.json(session)
})

export default app
