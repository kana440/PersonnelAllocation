// AgentRunner — drives the tool-calling loop for a single user turn.
//
// Flow:
//   1. Convert UI chat history to APIMessage[]
//   2. Append the new user message
//   3. Call the model (with tool definitions)
//   4. If the model returns tool_calls: dispatch by kind, append results, go to 3
//      - read    : 即時実行
//      - render  : Widget を latestWidget に格納し、summary をLLMへ返す
//      - confirm : onConfirm コールバックでUI停止 → 承認後に executeOnApprove
//   5. If the model returns a text response: return { text, widget? }
//   6. If MAX_ROUNDS is exceeded: return error message
//
// tool_call / tool_result messages はローカル配列のみで保持し、
// チャットストアには保存しない（最終テキストとウィジェットだけを返す）。

import type { APIMessage } from '../../ports'
import type { ChatMessage, ChatWidget, ConfirmResult } from '../../application/aiTypes'
import type { OpenAICompatibleAdapter } from './openAICompatibleAdapter'
import type { AITraceObserver } from './aiTrace'
import { SummaryTraceObserver, CompositeTraceObserver } from './aiTrace'
import { TOOL_LABELS } from './toolLabels'
import { toolRegistry } from './toolRegistry'
import { buildAPIMessages } from '../../application/chatSession'

const MAX_ROUNDS = 10


export interface AgentRunResult {
  text:    string
  widget?: ChatWidget
}

export interface AgentRunOptions {
  onProgress?:   (label: string) => void
  /** confirm ツールが呼ばれたとき、UIでウィジェットを表示しユーザーの判断を待つ。
   *  Promise が resolve するまで agentRunner のループは停止する。 */
  onConfirm?:    (widget: ChatWidget) => Promise<ConfirmResult>
  /** 呼び出し側がセッション固有コンテキスト（スコープ等）を追加するための system prompt 上書き。 */
  systemPrompt?: string
}

export class AgentRunner {
  private readonly summary:  SummaryTraceObserver
  private readonly observer: AITraceObserver

  constructor(
    private readonly adapter: OpenAICompatibleAdapter,
    extraObserver?: AITraceObserver,
    readonly model?: string,
  ) {
    this.summary  = new SummaryTraceObserver()
    this.observer = extraObserver
      ? new CompositeTraceObserver([this.summary, extraObserver])
      : this.summary
  }

  getSessionLog():  string { return this.summary.getLog() }
  clearSessionLog(): void  { this.summary.clear() }

  async run(
    history: ChatMessage[],
    userText: string,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const { onProgress, onConfirm, systemPrompt } = options ?? {}
    const messages: APIMessage[] = buildAPIMessages(history, systemPrompt)
    messages.push({ role: 'user', content: userText })

    let latestWidget: ChatWidget | undefined

    for (let round = 0; round < MAX_ROUNDS; round++) {
      this.observer.onEvent({
        kind: 'request', round, messages: [...messages],
        params: { model: this.model, toolCount: toolRegistry.definitions.length },
      })

      const result = await this.adapter.complete(messages, toolRegistry.definitions)

      // No tool calls → final text response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        const text = result.content ?? '（応答がありませんでした）'
        this.observer.onEvent({ kind: 'response', text })
        return { text, widget: latestWidget }
      }

      // Append the assistant's tool_call message
      messages.push({
        role:       'assistant',
        content:    result.content ?? '',
        tool_calls: result.toolCalls,
      })

      const firstTool = result.toolCalls[0]?.function.name ?? ''
      const label = TOOL_LABELS[firstTool] ?? firstTool
      onProgress?.(`${label}...`)

      for (const call of result.toolCalls) {
        const args = (() => {
          try { return JSON.parse(call.function.arguments) as Record<string, unknown> }
          catch { return {} as Record<string, unknown> }
        })()

        this.observer.onEvent({ kind: 'tool_call', round, toolName: call.function.name, args })

        const entry = toolRegistry.getEntry(call.function.name)
        let content: string

        if (entry?.kind === 'render') {
          const { summary, widget } = entry.execute(args)
          latestWidget = widget
          content = JSON.stringify(summary)

        } else if (entry?.kind === 'confirm') {
          const { widget } = entry.buildProposal(args)
          if (onConfirm) {
            const confirmResult = await onConfirm(widget)
            if (confirmResult.approved) {
              const applyResult = entry.executeOnApprove(args)
              content = JSON.stringify({ ok: true, result: applyResult })
            } else {
              content = JSON.stringify({ ok: false, cancelled: true, message: 'ユーザーが操作を取り消しました' })
            }
          } else {
            content = JSON.stringify({ error: '確認ハンドラが設定されていません' })
          }

        } else {
          // read tool (or unknown)
          const toolResult = toolRegistry.execute(call)
          content = toolResult.content
        }

        this.observer.onEvent({ kind: 'tool_result', round, toolName: call.function.name, result: content })
        messages.push({ role: 'tool', content, tool_call_id: call.id })
      }
    }

    const limitMsg = 'ツール呼び出しが上限（' + MAX_ROUNDS + ' 回）に達しました。処理を中断しました。'
    this.observer.onEvent({ kind: 'response', text: limitMsg })
    return { text: limitMsg, widget: latestWidget }
  }
}
