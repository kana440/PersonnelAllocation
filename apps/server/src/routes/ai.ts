// AI チャット用 LLM プロキシ。
//
// クライアント（apps/web の OpenAICompatibleAdapter）から見ると通常の OpenAI 互換 API と同じ形。
// 実際の LLM ベンダーの秘密鍵はこのサーバーだけが保持し、クライアントには一切渡さない。
// STEP1 には認証機構が無いため、AI_PROXY_SHARED_SECRET による簡易アクセス制御のみで守る。
//
// クライアント側は VITE_AI_BASE_URL をこのルートに向け、VITE_AI_API_KEY には
// AI_PROXY_SHARED_SECRET と同じ値を設定する（実際のLLMキーではない）。
//
// OpenAI 互換ボディはベンダーごとに細部が異なるため、リクエスト/レスポンスは
// あえてゆるい z.record() で受けている（ドメインAPI同様、フィールド単位の検証はしない。
// OpenAPI仕様上は "任意のJSONオブジェクト" として現れる）。

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { ProxyAgent } from 'undici'
import { env } from '../env.ts'

const app = new OpenAPIHono().basePath('/api/ai')

// AI_LLM_HTTP_PROXY が設定されている環境（社内プロキシ経由でないとLLMベンダーに到達できない）向け。
// Node の組み込み fetch は HTTP_PROXY 系の環境変数を自動では見ないため、明示的に dispatcher を渡す。
const proxyDispatcher = env.AI_LLM_HTTP_PROXY ? new ProxyAgent(env.AI_LLM_HTTP_PROXY) : undefined

// デバッグ用: 秘密鍵は先頭/末尾数文字と長さだけ出す（.env コピペ時の改行混入等の検出用）
function maskSecret(v: string): string {
  const trimmedLen = v.trim().length
  const lenNote = trimmedLen !== v.length ? `len=${v.length}(trim後${trimmedLen})` : `len=${v.length}`
  return v.length <= 8 ? `${'*'.repeat(v.length)} ${lenNote}` : `${v.slice(0, 4)}...${v.slice(-4)} ${lenNote}`
}

const chatCompletionsRoute = createRoute({
  method:  'post',
  path:    '/{model}/chat/completions',
  tags:    ['ai'],
  summary: 'OpenAI互換のchat/completionsをLLMベンダーへプロキシする（キーはサーバー側のみ保持）',
  request: {
    params: z.object({ model: z.string() }),
    body:   { content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
  },
  responses: {
    200: { description: 'OK',            content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
    401: { description: 'Unauthorized',  content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    502: { description: 'Upstream error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    503: { description: '未設定',         content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
  },
})

// このハンドラは upstream のステータスコードをそのまま返すパススルー実装のため、
// zod-openapi の固定ステータス型（TypedResponse）とは相容れない。OpenAPI仕様自体は
// route 定義（chatCompletionsRoute）側から正しく生成されるので、ハンドラの型チェックだけ
// any 経由で緩めている。
async function chatCompletionsHandler(c: any): Promise<Response> {
  if (!env.AI_LLM_BASE_URL || !env.AI_LLM_API_KEY) {
    return c.json({ error: 'AIプロキシが設定されていません（サーバー側の環境変数が未設定です）' }, 503)
  }

  if (env.AI_PROXY_SHARED_SECRET) {
    const provided = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (provided !== env.AI_PROXY_SHARED_SECRET) {
      return c.json({ error: 'unauthorized' }, 401)
    }
  }

  const { model } = c.req.valid('param')
  const upstreamUrl = env.AI_LLM_BASE_URL.replace('{model}', encodeURIComponent(model)).replace(/\/$/, '')
    + '/chat/completions'

  const body = await c.req.text()
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(env.AI_LLM_API_KEY_SCHEME === 'api-key'
      ? { 'api-key': env.AI_LLM_API_KEY }
      : { 'Authorization': `Bearer ${env.AI_LLM_API_KEY}` }),
  }

  console.log(
    `[ai-proxy] → POST ${upstreamUrl}\n`
    + `  raw model param = ${JSON.stringify(model)}\n`
    + `  headers sent    = ${JSON.stringify(Object.keys(reqHeaders))} (${env.AI_LLM_API_KEY_SCHEME}: ${maskSecret(env.AI_LLM_API_KEY)})\n`
    + `  body length     = ${body.length}`
  )

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method:  'POST',
      headers: reqHeaders,
      body,
      ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
    } as RequestInit)
  } catch (err) {
    console.error(`[ai-proxy] fetch自体が失敗: ${String(err)}`)
    return c.json({ error: `LLMサーバーへの接続に失敗しました: ${String(err)}` }, 502)
  }

  // 純粋なパススルー: upstream のステータスコードをそのまま返す
  const resBody = await upstreamRes.text()
  if (!upstreamRes.ok) {
    const resHeaders = Object.fromEntries(upstreamRes.headers.entries())
    console.error(
      `[ai-proxy] ← ${upstreamRes.status} ${upstreamUrl}\n`
      + `  response headers = ${JSON.stringify(resHeaders)}\n`
      + `  response body    = ${resBody.slice(0, 500)}`
    )
  }
  return new Response(resBody, {
    status:  upstreamRes.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

app.openapi(chatCompletionsRoute, chatCompletionsHandler as any)

// ── OpenAPI仕様 + Swagger UI ──────────────────────────────────────────────────

// .basePath('/api/ai') 済みのため、ここは相対パスで登録する
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title:       'PersonnelAllocation AI Proxy API',
    version:     '1.0.0',
    description: 'LLMベンダーへのステートレスなプロキシ。実際のAPIキーはサーバー側のみ保持する。',
  },
})
app.get('/doc', swaggerUI({ url: '/api/ai/openapi.json' }))

export default app
