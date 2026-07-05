import type { ContactRecord, ContactMessage, ContactStatus, RequestType, ContactAnchor } from '../../ports/contactTypes'
import { CONTACT_STATUS_LABEL } from '../../ports/contactTypes'

export const TSV_COLUMNS = [
  '連絡票番号', 'ステータス', '作成日', '依頼者メール', '依頼者名',
  '宛先組織コード', '宛先組織名', '担当者ヒント', '対象者名',
  '依頼概要', '最新回答概要', 'スレッドData', '適用値', '更新日',
  'Before組織コード', 'アンカーData',
] as const

export type TsvColumn = typeof TSV_COLUMNS[number]

const TSV_MIN_COLS = 14  // 旧形式との後方互換

export function toHeaderTsv(): string {
  return TSV_COLUMNS.join('\t')
}

export function toRequestTsv(record: ContactRecord): string {
  return rowToTsv(record, false)
}

export function toFullTsv(record: ContactRecord): string {
  return rowToTsv(record, true)
}

function rowToTsv(record: ContactRecord, includeAnswer: boolean): string {
  const requestSummary = record.thread[0]?.summary ?? ''
  const latestAnswer   = includeAnswer ? getLatestAnswer(record) : null
  const updatedAt      = getLatestAt(record)

  return [
    record.id,
    CONTACT_STATUS_LABEL[record.status],
    record.createdAt.slice(0, 10),
    record.requesterEmail,
    record.requesterName ?? '',
    record.targetOrgId,
    record.targetOrgName,
    record.assigneeHint ?? '',
    record.personName,
    requestSummary,
    latestAnswer?.summary ?? '',
    JSON.stringify(record.thread),
    includeAnswer ? (record.resolvedValue ?? '') : '',
    updatedAt,
    record.beforeOrgCodeHint ?? '',
    record.anchor ? JSON.stringify(record.anchor) : '',
  ].join('\t')
}

export function fromTsv(line: string): ContactRecord | null {
  const parts = line.split('\t')
  if (parts.length < TSV_MIN_COLS) return null

  const [
    id, statusLabel, createdAt,
    requesterEmail, requesterName,
    targetOrgId, targetOrgName, assigneeHint,
    personName,
    _requestSummary, _latestAnswerSummary,
    threadJson,
    resolvedValue,
    _updatedAt,
    beforeOrgCodeHint,
    anchorJson,
  ] = parts

  if (!id || !requesterEmail || !targetOrgId) return null

  let thread: ContactMessage[] = []
  try { thread = JSON.parse(threadJson) as ContactMessage[] } catch { return null }
  if (!Array.isArray(thread) || thread.length === 0) return null

  const firstMsg = thread[0]
  const fieldKey    = firstMsg?.data?.fieldKey ?? ''
  const requestType = (firstMsg?.data?.requestType ?? 'other') as RequestType

  let anchor: ContactAnchor | undefined
  if (anchorJson) {
    try { anchor = JSON.parse(anchorJson) as ContactAnchor } catch { /* ignore */ }
  }

  return {
    id,
    status:              labelToStatus(statusLabel),
    createdAt,
    requesterEmail,
    requesterName:       requesterName || undefined,
    targetOrgId,
    targetOrgName,
    assigneeHint:        assigneeHint || undefined,
    anchorRowId:         -1,
    personName,
    fieldKey,
    requestType,
    beforeOrgCodeHint:   beforeOrgCodeHint || undefined,
    anchor,
    thread,
    resolvedValue:       resolvedValue || undefined,
    archived:            false,
  }
}

// スプレッドシート全体（複数行）をパース。ヘッダー行は自動スキップ。
export function fromSpreadsheet(tsv: string): ContactRecord[] {
  const lines = tsv.split('\n').map(l => l.trimEnd()).filter(Boolean)
  const records: ContactRecord[] = []
  for (const line of lines) {
    if (line.startsWith(TSV_COLUMNS[0])) continue  // ヘッダー行をスキップ
    const r = fromTsv(line)
    if (r) records.push(r)
  }
  return records
}

// ── 内部ヘルパー ───────────────────────────────────────────────

function getLatestAnswer(record: ContactRecord): ContactMessage | undefined {
  return [...record.thread].reverse().find(m => m.type === 'answer' || m.type === 'unknown')
}

function getLatestAt(record: ContactRecord): string {
  const latest = record.thread.at(-1)
  return (latest?.createdAt ?? record.createdAt).slice(0, 10)
}

function labelToStatus(label: string): ContactStatus {
  const found = (Object.entries(CONTACT_STATUS_LABEL) as [ContactStatus, string][])
    .find(([, l]) => l === label)
  return found?.[0] ?? 'sent'
}
