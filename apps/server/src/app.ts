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
import aiRoutes         from './routes/ai.ts'
import domainRoutes     from './routes/domain.ts'
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
  // ai.ts / domain.ts は OpenAPIHono を .basePath() で組み立てているため、
  // ここではプレフィックス無しでルートにマウントする（basePath 側に既に /api/ai・/api/domain を含む）。
  // STEP1 には認証機構が無いため authenticated を通さない。
  // ai.ts は AI_PROXY_SHARED_SECRET によるアクセス制御をルート内で行う。
  // domain.ts は今のところ allocationList を扱わない読み取り専用の軽い計算のみを公開している。
  .route('/', aiRoutes)
  .route('/', domainRoutes)
  .get('/', (c) => c.json({ message: 'PersonnelAllocation Server', status: 'ok' }))

export default app

// Hono RPC クライアントが使う型
// apps/web/src/infrastructure/api/client.ts で import type { AppType } として使う
export type AppType = typeof app
