import { z } from 'zod'

const schema = z.object({
  NODE_ENV:   z.enum(['development', 'production', 'test']).default('development'),
  PORT:       z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET は8文字以上にしてください')
                        .default('dev-secret-do-not-use-in-production'),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGIN:  z.string().default('http://localhost:5173'),
  DB_PATH:      z.string().default('data/pglite'),

  // SAML（本番のみ。未設定でも起動は可能）
  SAML_ENTRY_POINT:          z.string().optional(),
  SAML_ISSUER:               z.string().optional(),
  SAML_IDP_CERT:             z.string().optional(),
  SAML_CALLBACK_URL:         z.string().optional(),
  SAML_REDIRECT_AFTER_LOGIN: z.string().default('/'),
})

// 本番では JWT_SECRET の強度を追加チェック
const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ 環境変数が不正です:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

if (parsed.data.NODE_ENV === 'production') {
  if (parsed.data.JWT_SECRET === 'dev-secret-do-not-use-in-production') {
    console.error('❌ 本番環境で JWT_SECRET がデフォルト値のままです。必ず変更してください。')
    process.exit(1)
  }
  if (parsed.data.JWT_SECRET.length < 32) {
    console.error('❌ 本番環境の JWT_SECRET は32文字以上にしてください。')
    process.exit(1)
  }
}

export const env = parsed.data
