// chatSession — converts the UI conversation history into the stateless
// APIMessage[] format and delegates to an IChatService implementation.
//
// Stateless pattern: the full history is sent on every call, so the server
// needs no session state. Swap out the IChatService to switch backends.

import type { ChatMessage, SelectedRowContext } from './aiTypes'
import type { IChatService, APIMessage } from '../ports'

const BASE_SYSTEM_PROMPT =
  'あなたは人事異動管理システムのAIアシスタントです。' +
  '組織異動・出向・兼務追加・昇降格など、人事異動に関する操作をサポートします。' +
  '要員配置リストのデータに基づいて、簡潔・丁寧に回答してください。\n\n' +
  '## ツール利用ガイドライン\n' +
  '- 従業員を探すときは必ず findPersons を使う。名前が曖昧な場合は候補を列挙してユーザーに確認する。\n' +
  '- 役職変更（「課長にして」等）は propose_change_position を使う。propose_field_edit は補足情報の編集のみ。\n' +
  '- 組織を指定するときは findOrgs で orgCode を取得してから操作する。\n' +
  '- confirm ツール（propose_*）は必ずユーザーの確認を得てから executeOnApprove が呼ばれる。承認前に「実行した」と言わない。\n' +
  '- 「組織図を見せて」「全体像を見せて」には getOrgTree を使う。\n' +
  '- スコープ（作業対象組織）が設定されている場合、操作対象はそのスコープ内に限定される。\n'

export type { SelectedRowContext }  // aiTypes.ts で定義。後方互換のため re-export

/**
 * Build a system prompt for the current session.
 * Pass scope info so the AI knows which organization the user is working in.
 * Pass selectedRow so the AI knows which row the user is focused on.
 */
export function buildSystemPrompt(
  scopeOrgName?:  string,
  scopeOrgCode?:  string,
  selectedRows?:  SelectedRowContext[],
): string {
  let prompt = BASE_SYSTEM_PROMPT
  if (scopeOrgName) {
    prompt +=
      `\n## 現在の作業スコープ\n作業対象組織: ${scopeOrgName}（コード: ${scopeOrgCode ?? '不明'}）\n` +
      'この組織とその配下が主な操作対象です。'
  }
  if (selectedRows && selectedRows.length > 0) {
    const label = selectedRows.length === 1 ? '現在選択中の行' : `現在選択中の行（${selectedRows.length}件）`
    prompt += `\n\n## ${label}\n`
    for (const row of selectedRows) {
      prompt += `- rowId: ${row.rowId}、氏名: ${row.name}、組織: ${row.orgName}`
      if (row.issues.length > 0) {
        prompt += `\n  バリデーション問題:\n` +
          row.issues.map(i => `  - [${i.level}] ${i.field}: ${i.message}`).join('\n') + '\n'
      } else {
        prompt += `（バリデーション問題なし）\n`
      }
    }
    const hasIssues = selectedRows.some(r => r.issues.length > 0)
    if (hasIssues) {
      prompt +=
        'ユーザーが「このレコードのエラーを解消して」と依頼した場合、' +
        '上記の問題を修正するための操作（getFieldOptions → propose_field_edit）を順に実行すること。'
    }
  }
  return prompt
}

export function buildAPIMessages(
  history: ChatMessage[],
  systemPrompt = BASE_SYSTEM_PROMPT,
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
