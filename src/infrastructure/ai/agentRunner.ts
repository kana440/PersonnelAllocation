// AgentRunner — drives the tool-calling loop for a single user turn.
//
// Flow:
//   1. Convert UI chat history to APIMessage[]
//   2. Append the new user message
//   3. Call the model (with tool definitions)
//   4. If the model returns tool_calls: execute each, append results, go to 3
//   5. If the model returns a text response: return it
//   6. If MAX_ROUNDS is exceeded: return an error message
//
// The tool_call / tool_result messages are kept in a local array and are
// NOT stored in the chat store — only the final user-visible reply is returned.

import type { APIMessage } from '../../ports'
import type { ChatMessage } from '../../components/ai/types'
import type { OpenAICompatibleAdapter } from './openAICompatibleAdapter'
import { toolRegistry } from './toolRegistry'
import { buildAPIMessages } from '../../application/chatSession'

const MAX_ROUNDS = 10

export class AgentRunner {
  constructor(private readonly adapter: OpenAICompatibleAdapter) {}

  /**
   * Run one user turn with the agentic loop.
   *
   * @param history  — UI chat history before this message (used as context)
   * @param userText — the new user message
   * @param onProgress — optional callback called with a progress label while
   *                     tools are executing (e.g. for updating the loading bubble)
   */
  async run(
    history: ChatMessage[],
    userText: string,
    onProgress?: (label: string) => void,
  ): Promise<string> {
    // Build the initial message list from the UI history + the new user message
    const messages: APIMessage[] = buildAPIMessages(history)
    messages.push({ role: 'user', content: userText })

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await this.adapter.complete(messages, toolRegistry.definitions)

      // No tool calls → final text response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        return result.content ?? '（応答がありませんでした）'
      }

      // Append the assistant's tool_call message
      messages.push({
        role:        'assistant',
        content:     result.content ?? '',
        tool_calls:  result.toolCalls,
      })

      // Execute each tool and append the results
      const toolNames = result.toolCalls.map(tc => tc.function.name).join(', ')
      onProgress?.(`ツール実行中: ${toolNames}…`)

      for (const call of result.toolCalls) {
        const toolResult = toolRegistry.execute(call)
        messages.push({
          role:         'tool',
          content:      toolResult.content,
          tool_call_id: toolResult.toolCallId,
        })
      }
    }

    return 'ツール呼び出しが上限（' + MAX_ROUNDS + ' 回）に達しました。処理を中断しました。'
  }
}
