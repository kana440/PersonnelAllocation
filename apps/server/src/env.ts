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

  // AI プロキシ（STEP1/STEP2 共通の AI チャット機能向け。未設定でも起動可能・その場合 /api/ai は 503 を返す）
  // 実際の LLM ベンダーの秘密鍵はここにだけ置き、クライアントには絶対に渡さない。
  AI_LLM_BASE_URL:        z.string().optional(),  // 例: https://your-llm.internal/v1/{model}
  AI_LLM_API_KEY:         z.string().optional(),
  AI_LLM_API_KEY_SCHEME:  z.enum(['bearer', 'api-key']).default('bearer'),
  // STEP1 には認証機構が無いため、この共有シークレットで最低限のアクセス制御を行う
  // （クライアントは VITE_AI_API_KEY にこの値を設定し、Authorization ヘッダーとして送る）。
  AI_PROXY_SHARED_SECRET: z.string().optional(),
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
  if (parsed.data.AI_LLM_BASE_URL && !parsed.data.AI_PROXY_SHARED_SECRET) {
    console.error('❌ 本番環境で AI_LLM_BASE_URL が設定されていますが AI_PROXY_SHARED_SECRET が未設定です。'
      + '認証なしで誰でも課金対象のLLM APIを叩けてしまうため、必ず設定してください。')
    process.exit(1)
  }
}

export const env = parsed.data
