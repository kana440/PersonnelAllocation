// Mock implementation of IChatService.
// Receives the full APIMessage[] history (stateless pattern) and returns a
// canned response. Swap this for openAICompatibleAdapter.ts to use a real API.

import type { IChatService, APIMessage } from '../../ports'

export class MockApiService implements IChatService {
  async chat(messages: APIMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return 'ご質問を入力してください。'
    return `モックのため、画面上のおすすめ質問から選択してください。（受信: 「${lastUser.content}」）`
  }
}

export const mockApiService = new MockApiService()
