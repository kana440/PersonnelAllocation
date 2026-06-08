// custom promptfoo provider — OpenAICompatibleAdapter を直接 import して使う
//
// .env.local から VITE_AI_* を自動読み込みするので export 不要。
//
// 実行例（プロジェクトルートから）:
//   npx promptfoo@latest eval -c evals/skills/skill_routing.yaml \
//     --providers "$(pwd)/evals/providers/customLlm.ts"

import * as dotenv from 'dotenv'
import * as path   from 'path'
import { fileURLToPath } from 'url'
import { OpenAICompatibleAdapter } from '../../apps/web/src/infrastructure/ai/openAICompatibleAdapter'
import type { APIMessage, ToolDefinition } from '../../apps/web/src/ports'

// ESM / CJS どちらでも動くよう両方試みる
const _dir = typeof __dirname !== 'undefined'
  ? __dirname                                       // CJS
  : path.dirname(fileURLToPath(import.meta.url))    // ESM
const projectRoot = path.resolve(_dir, '../..')

// Vite の .env.local は apps/web/ に置くのが規約なのでそちらを優先する
dotenv.config({ path: path.resolve(projectRoot, 'apps/web/.env.local') })
if (!process.env.VITE_AI_BASE_URL) {
  dotenv.config({ path: path.resolve(projectRoot, '.env.local') })
}

const BASE_URL_TEMPLATE = process.env.VITE_AI_BASE_URL
const API_KEY           = process.env.VITE_AI_API_KEY           ?? ''
const API_KEY_SCHEME    = process.env.VITE_AI_API_KEY_SCHEME === 'api-key' ? 'api-key' as const : 'bearer' as const
const OMIT_MODEL        = process.env.VITE_AI_OMIT_MODEL        === 'true'
// chatServiceFactory.ts に合わせて VITE_AI_MODELS（カンマ区切り）の先頭モデルを使う
const RAW_MODELS        = process.env.VITE_AI_MODELS ?? ''
const MODEL             = RAW_MODELS.split(',').map(m => m.trim()).filter(Boolean)[0] ?? 'default-model'

if (!BASE_URL_TEMPLATE) {
  throw new Error('apps/web/.env.local に VITE_AI_BASE_URL が設定されていません')
}

// chatServiceFactory.ts と同じ URL 解決ロジック
const baseUrl = BASE_URL_TEMPLATE.replace('{model}', encodeURIComponent(MODEL))

const adapter = new OpenAICompatibleAdapter({
  baseUrl, model: MODEL, apiKey: API_KEY, apiKeyScheme: API_KEY_SCHEME,
  omitModel: OMIT_MODEL, temperature: 0.0, maxTokens: 512,
})

// YAML の Anthropic 形式 (name/description/input_schema) を
// OpenAI 形式 (type:'function'/function.parameters) に変換する
function normalizeTool(t: unknown): ToolDefinition | null {
  if (!t || typeof t !== 'object') return null
  const tool = t as Record<string, unknown>
  if (tool.type === 'function' && typeof tool.function === 'object') {
    return tool as unknown as ToolDefinition
  }
  if (typeof tool.name === 'string') {
    return {
      type: 'function',
      function: {
        name:        tool.name,
        description: (tool.description as string) ?? '',
        parameters:  (tool.input_schema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    }
  }
  return null
}

// promptfoo は default export を new Provider(config) でインスタンス化するためクラスが必要
// tools は YAML の providers[].config.tools から constructor 経由で渡される
export default class CustomLlmProvider {
  private providerTools: ToolDefinition[]

  constructor(_config?: Record<string, unknown>) {
    // promptfoo はカスタムプロバイダーに config を渡さないため、tools は vars 経由で受け取る
    this.providerTools = []
  }

  id() { return `custom-llm:${MODEL}` }

  async callApi(prompt: string | APIMessage[], context: { vars?: Record<string, unknown>; config?: Record<string, unknown> }) {
    const messages: APIMessage[] = typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : prompt as APIMessage[]

    // tools は context.vars.tools 経由で渡される（YAML の defaultTest.vars.tools）
    const varRaw  = Array.isArray(context?.vars?.tools)   ? context.vars.tools   : []
    const ctxRaw  = Array.isArray(context?.config?.tools) ? context.config.tools : []
    const allTools: ToolDefinition[] = [
      ...this.providerTools,
      ...[...varRaw, ...ctxRaw].map(normalizeTool).filter((t): t is ToolDefinition => t !== null),
    ]

    const result = await adapter.complete(messages, allTools.length ? allTools : undefined)
    // promptfoo の ProviderResponse は toolCalls フィールドを持たないため、
    // ツールコールがある場合は output をオブジェクトにして埋め込む。
    // assertion 側: output.toolCalls でアクセスできる。
    const output = result.toolCalls?.length
      ? { content: result.content ?? '', toolCalls: result.toolCalls }
      : (result.content ?? '')
    return { output }
  }
}
