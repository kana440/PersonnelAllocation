import './env.ts'   // 起動時に環境変数を検証（失敗するとプロセス終了）
import { serve } from '@hono/node-server'
import { getDb } from './db/database.ts'
import app from './app.ts'

// PGlite の初期化（migrate + seed）をリクエスト前に完了させる
await getDb()

const PORT = Number(process.env.PORT ?? 3000)
console.log(`Server running on http://localhost:${PORT}`)
serve({ fetch: app.fetch, port: PORT })
