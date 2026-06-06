import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import authRoutes      from './routes/auth.ts'
import sessionRoutes   from './routes/sessions.ts'
import rowRoutes       from './routes/rows.ts'
import submitRoutes    from './routes/submit.ts'
import adminUserRoutes from './routes/admin/users.ts'
import { authMiddleware, requireRole } from './auth/stub.ts'
import type { AppEnv } from './auth/stub.ts'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: 'http://localhost:5173' })) // Vite dev server

app.route('/api/auth',     authRoutes)
app.route('/api/sessions', sessionRoutes)
app.route('/api/sessions', rowRoutes)
app.route('/api/sessions', submitRoutes)

// 管理者ルート（super_admin のみ）
const admin = new Hono<AppEnv>()
admin.use('*', authMiddleware)
admin.use('*', requireRole('super_admin'))
admin.route('/users', adminUserRoutes)
app.route('/api/admin', admin)

app.get('/', (c) => c.json({ message: 'PersonnelAllocation Server', status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3000)
console.log(`Server running on http://localhost:${PORT}`)
serve({ fetch: app.fetch, port: PORT })
