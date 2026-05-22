// chatSession — converts the UI conversation history into the stateless
// APIMessage[] format and delegates to an IChatService implementation.
//
// Stateless pattern: the full history is sent on every call, so the server
// needs no session state. Swap out the IChatService to switch backends.

import type { ChatMessage } from '../components/ai/types'
import type { IChatService, APIMessage } from '../ports'

const DEFAULT_SYSTEM_PROMPT =
  'あなたは人事異動管理システムのAIアシスタントです。' +
  '組織異動・出向・兼務追加・昇降格など、人事異動に関する操作をサポートします。' +
  '要員配置リストのデータに基づいて、簡潔・丁寧に回答してください。'

export function buildAPIMessages(
  history: ChatMessage[],
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
): APIMessage[] {
  const apiHistory: APIMessage[] = history
    .filter(m => !m.isLoading && Boolean(m.text))
    .map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

  return [{ role: 'system', content: systemPrompt }, ...apiHistory]
}

export class ChatSession {
  constructor(private readonly service: IChatService) {}

  // Sends the full history (including the new user message) to the API.
  // The caller is responsible for appending the returned text to the history.
  async send(historyBeforeNewMsg: ChatMessage[], newUserText: string): Promise<string> {
    const withNew: ChatMessage = { id: '', role: 'user', text: newUserText }
    const msgs = buildAPIMessages([...historyBeforeNewMsg, withNew])
    return this.service.chat(msgs)
  }
}
