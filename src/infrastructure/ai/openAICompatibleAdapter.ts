// OpenAI-compatible HTTP adapter (fetch-based, browser-safe).
//
// Model in URL:
//   The factory resolves the {model} placeholder in VITE_AI_BASE_URL before
//   passing baseUrl to this adapter.  Example:
//     baseUrl = "https://llm.internal/v1/gpt-4o"
//     → POST https://llm.internal/v1/gpt-4o/chat/completions
//   The model name is also included in the request body for APIs that require it.
//
// Proxy support:
//   fetch in a browser build honours the OS / browser system proxy automatically.
//   The httpsProxy field is reserved for a future migration to an Electron main
//   process or Node.js BFF, where you would do:
//     import { ProxyAgent, fetch as undiciFetch } from 'undici'
//     undiciFetch(url, { ..., dispatcher: new ProxyAgent(httpsProxy) })

import type { IChatServiceWithTools, APIMessage, ToolDefinition, CompletionResult } from '../../ports'

export interface OpenAIAdapterConfig {
  baseUrl:     string  // already has model name embedded (placeholder resolved by factory)
  model:       string  // model name also sent in the request body
  apiKey:      string
  httpsProxy?: string  // reserved — see note above
  temperature?: number
  maxTokens?:   number
  timeoutMs?:   number
}

interface RawChoice {
  message?: {
    content?:    string | null
    tool_calls?: Array<{
      id: string
      type: string
      function: { name: string; arguments: string }
    }>
  }
}

export class OpenAICompatibleAdapter implements IChatServiceWithTools {
  private readonly cfg: Required<OpenAIAdapterConfig>

  constructor(config: OpenAIAdapterConfig) {
    this.cfg = {
      httpsProxy:  '',
      temperature: 0.7,
      maxTokens:   4096,
      timeoutMs:   30_000,
      ...config,
    }
  }

  // ── IChatService ─────────────────────────────────────────────────────────────
  async chat(messages: APIMessage[]): Promise<string> {
    const result = await this.complete(messages)
    return result.content ?? ''
  }

  // ── IChatServiceWithTools ─────────────────────────────────────────────────────
  async complete(messages: APIMessage[], tools?: ToolDefinition[]): Promise<CompletionResult> {
    const url  = this.cfg.baseUrl.replace(/\/$/, '') + '/chat/completions'
    const body: Record<string, unknown> = {
      model:       this.cfg.model,
      messages,
      temperature: this.cfg.temperature,
      max_tokens:  this.cfg.maxTokens,
    }
    if (tools && tools.length > 0) {
      body.tools       = tools
      body.tool_choice = 'auto'
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.cfg.apiKey}`,
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`API ${res.status}: ${errText}`)
      }

      const data = await res.json() as { choices?: RawChoice[] }
      const msg  = data.choices?.[0]?.message

      return {
        content:   msg?.content ?? undefined,
        toolCalls: msg?.tool_calls?.map(tc => ({
          id:       tc.id,
          type:     tc.type as 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
