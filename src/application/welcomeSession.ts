// WelcomeSession — pre-data lightweight chat agent.
//
// No tools.  Uses the adapter's plain chat() method so there is no tool-calling
// overhead.  The system prompt instructs the model to always close with the
// "load Excel to get started" hint.

import type { ChatMessage } from './aiTypes'
import type { IChatService } from '../ports'
import { buildAPIMessages } from './chatSession'

const WELCOME_SYSTEM_PROMPT =
  'あなたは人事異動管理ツールのAIアシスタントです。\n' +
  'Excelを読み込む前の状態で、ツールの使い方や機能についての質問にお答えします。\n\n' +
  '## このツールでできること\n' +
  '- 要員配置リスト（Excel）の読み込みと内容確認\n' +
  '- 組織ツリーの表示・メンバー確認\n' +
  '- 異動・昇進・兼務追加・出向などの人事操作\n' +
  '- レポートラインの確認\n' +
  '- 変更差分の確認とExcelエクスポート\n\n' +
  '## 回答ルール\n' +
  '- 要員データへの操作（人物検索、組織確認、異動作業など）はExcel読み込み後にのみ実行できます。\n' +
  '- 必ず回答の最後に次の一文を添えてください：\n' +
  '  「開始するには、「📂 Excelを読み込んで開始」から要員配置リストを読み込んでください。」'

export class WelcomeSession {
  constructor(private readonly service: IChatService) {}

  async send(history: ChatMessage[], userText: string): Promise<string> {
    const withNew: ChatMessage = { id: '', role: 'user', text: userText }
    const msgs = buildAPIMessages([...history, withNew], WELCOME_SYSTEM_PROMPT)
    return this.service.chat(msgs)
  }
}
