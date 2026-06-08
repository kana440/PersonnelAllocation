// アプリケーション組み立て + Hono RPC 用 AppType エクスポート
//
// このファイルの AppType を apps/web がインポートして
// hc<AppType>() で型安全なクライアントを生成する。

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { authenticated, requireRole } from './auth/index.ts'
import authRoutes       from './routes/auth.ts'
import roundRoutes      from './routes/rounds.ts'
import submissionRoutes from './routes/submissions.ts'
import adminUserRoutes     from './routes/admin/users.ts'
import adminPositionRoutes from './routes/admin/positions.ts'
import adminSkillRoutes    from './routes/admin/skills.ts'

// 管理者専用サブアプリ（authenticated + requireRole('admin') を適用）
const adminApp = new Hono()
  .use(authenticated)
  .use(requireRole('admin'))
  .route('/users',     adminUserRoutes)
  .route('/positions', adminPositionRoutes)
  .route('/skills',    adminSkillRoutes)

// アプリ本体（メソッドチェーンで組み立てることで AppType が正しく推論される）
const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }))
  .route('/api/auth',        authRoutes)
  .route('/api/rounds',      roundRoutes)
  .route('/api/submissions', submissionRoutes)
  .route('/api/admin',       adminApp)
  .get('/', (c) => c.json({ message: 'PersonnelAllocation Server', status: 'ok' }))

export default app

// Hono RPC クライアントが使う型
// apps/web/src/infrastructure/api/client.ts で import type { AppType } として使う
export type AppType = typeof app
