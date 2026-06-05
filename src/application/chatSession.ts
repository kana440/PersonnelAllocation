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
  '- フィールドに設定できる値を確認するときは getFieldOptions を使う。\n' +
  '- スコープ（作業対象組織）が設定されている場合、操作対象はそのスコープ内に限定される。\n' +
  '- 操作完了後は必ず getValidationDiagnosis を呼んで問題を確認し、自動修正可能なものから提案する。\n\n' +
  '## 業務ルール\n' +
  '- 昇降格（band または positionBand が変わる場合）は必ず新しいポジションを作成する。既存の positionCode を引き継がない。\n' +
  '- positionCode が "_pos_" で始まる場合は内部採番コード。Excel 出力時は空欄になる。\n' +
  '- prevXxx フィールド（発令前の状態）は変更しない。\n' +
  '- managerPositionCode を変更するときは propose_set_manager_position を使う（saveRow で直接変更すると managerName が更新されない）。\n' +
  '- 兼務を示す申請区分（transferReason）が選択されている場合、leaveOfAbsenceSign は設定できない（バリデーションで検出される）。\n\n' +
  '## 禁止事項\n' +
  '- prevXxx フィールドを直接変更すること\n' +
  '- positionCode を "_pos_" prefix なしで自己採番すること\n' +
  '- managerPositionCode を propose_set_manager_position 以外の方法で変更すること\n'

export type { SelectedRowContext }  // aiTypes.ts で定義。後方互換のため re-export

export interface SessionState {
  changedCount:  number
  errorCount:    number
  warningCount:  number
}

export function buildSystemPrompt(
  scopeOrgName?:  string,
  scopeOrgCode?:  string,
  selectedRows?:  SelectedRowContext[],
  session?:       SessionState,
): string {
  let prompt = BASE_SYSTEM_PROMPT

  if (session && (session.changedCount > 0 || session.errorCount > 0)) {
    prompt += '\n## 現在のセッション状態\n'
    if (session.changedCount > 0)
      prompt += `- 変更行: ${session.changedCount} 件\n`
    if (session.errorCount > 0)
      prompt += `- バリデーションエラー: ${session.errorCount} 件（getValidationDiagnosis で詳細確認可能）\n`
    if (session.warningCount > 0)
      prompt += `- バリデーション警告: ${session.warningCount} 件\n`
  }

  if (scopeOrgName) {
    prompt +=
      `\n## 現在の作業スコープ\n作業対象組織: ${scopeOrgName}（コード: ${scopeOrgCode ?? '不明'}）\n` +
      'この組織とその配下が主な操作対象です。'
  }
  if (selectedRows && selectedRows.length > 0) {
    const count = selectedRows.length
    prompt += `\n\n## ピン留め参照情報（${count}件）\n`
    prompt +=
      'ユーザーがチャットにピン留めした行の情報です。' +
      '「エラーを直して」「この人を異動させて」のようにピン留め行を指していると推察できる場合はこの情報を使ってください。' +
      '「全員の〇〇を確認して」「前の操作を取り消して」など明らかに全体・別の対象を向いている場合は、ピン留め行を前提にしないでください。\n\n'
    for (const row of selectedRows) {
      prompt += `- ${row.name}（rowId: ${row.rowId}） | ${row.orgName}`
      if (row.changeKinds?.length) {
        prompt += ` | 変更種別: ${row.changeKinds.join('、')}`
      }
      prompt += '\n'
      const kf = row.keyFields
      if (kf) {
        const fieldLines = [
          kf.employmentType       && `employmentType: ${kf.employmentType}`,
          kf.band                 && `band: ${kf.band}`,
          kf.payGrade             && `payGrade: ${kf.payGrade}`,
          kf.officialPositionCode && `officialPositionCode: ${kf.officialPositionCode}`,
          kf.leaveOfAbsenceSign   && `leaveOfAbsenceSign: ${kf.leaveOfAbsenceSign}（休職中）`,
          kf.concurrentType       && `concurrentType: ${kf.concurrentType}`,
        ].filter(Boolean)
        if (fieldLines.length) prompt += `  フィールド: ${fieldLines.join(', ')}\n`
      }
      if (row.availableOps?.length) {
        prompt += `  利用可能な操作: ${row.availableOps.join('、')}\n`
      }
      if (row.issues.length > 0) {
        prompt += `  バリデーション問題:\n` +
          row.issues.map(i => `    - [${i.level}] ${i.field}: ${i.message}`).join('\n') + '\n'
      }
    }
    const hasIssues = selectedRows.some(r => r.issues.length > 0)
    if (hasIssues) {
      prompt +=
        '\nユーザーが「このエラーを直して」「この行を修正して」と依頼した場合は、' +
        '上記の行が対象です。getFieldOptions で有効値を確認してから propose_field_edit を実行してください。'
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
