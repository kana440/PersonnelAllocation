import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema:  './src/db/schema.ts',
  out:     './src/db/drizzle',
  dialect: 'postgresql',
  // dbCredentials は drizzle-kit push/pull 用（PGlite dev では不使用）
  // Aurora 本番では DATABASE_URL を設定する
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/personnel_dev',
  },
})
