import type { IAIChatService, ChatMessage } from '../../ports'

export class MockChatService implements IAIChatService {
  async send(_history: ChatMessage[], _userMessage: string): Promise<string> {
    await new Promise(r => setTimeout(r, 800))
    return '（AIの応答はここに表示されます。現在モックモードです。実際のAI連携は今後実装予定です。）'
  }
}

export const mockChatService = new MockChatService()
