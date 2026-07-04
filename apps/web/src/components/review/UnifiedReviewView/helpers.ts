import type { AllocationRow } from '@personnel/domain/allocationRow'
import { BEFORE_AFTER_FIELD_PAIRS } from '@personnel/domain/allocationRow'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import { RESOLUTION_DEFS } from '@personnel/domain/rules/resolve'
import type { ReviewRow } from '../hooks/useReviewData'
import type { UnifiedFilter, IssueGroupDef } from './types'

// ── パターンラベル ────────────────────────────────────────────────────────────

export const PATTERN_CHIP_DEFS: { key: EditPattern; label: string; color: string }[] = [
  { key: 'orgTransfer',          label: '別組織へ異動',       color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'orgRestructure',       label: '組改',              color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { key: 'promotion',            label: '昇格',              color: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'demotion',             label: '降格',              color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'titleChange',          label: '役職変更',          color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { key: 'jobTypeChange',        label: 'JT変更',            color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'secondmentOut',        label: '本務出向',          color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'secondmentIn',         label: '出向受入',          color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { key: 'secondmentOutRelease', label: '出向解除',          color: 'bg-red-100 text-red-600 border-red-200' },
  { key: 'secondmentInRelease',  label: '受入解除',          color: 'bg-red-100 text-red-600 border-red-200' },
  { key: 'leaveOfAbsence',       label: '休職',              color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { key: 'returnFromLeave',      label: '復職',              color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { key: 'concurrentAdd',        label: '兼務追加',          color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { key: 'positionChange',       label: 'Pos変更',           color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { key: 'employmentTransfer',   label: '移籍',              color: 'bg-red-50 text-red-600 border-red-100' },
  { key: 'noChange',             label: '変更なし',          color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  { key: 'termination',          label: '退職',              color: 'bg-red-100 text-red-700 border-red-200' },
]

export const PATTERN_LABEL_MAP: Partial<Record<EditPattern, string>> = Object.fromEntries(
  PATTERN_CHIP_DEFS.map(d => [d.key, d.label])
) as Partial<Record<EditPattern, string>>

// ── フィルタ ─────────────────────────────────────────────────────────────────

function getSearchStr(row: AllocationRow, field: string, orgPathMap: Map<string, string>): string {
  if (field === '__name__')    return [row.lastName, row.firstName].filter(Boolean).join(' ')
  if (field === '__orgPath__') return orgPathMap.get((row.departmentCode as string | undefined) ?? '') ?? ''
  return String((row as Record<string, unknown>)[field] ?? '')
}

/**
 * スペース・カンマ・改行（全角含む）で区切った OR 検索トークン列を返す。
 * 氏名リストをコピペで貼り付けると各行が1トークンになる。
 */
export function parseSearchTokens(query: string): string[] {
  return query.split(/[\s,\n\r，　]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
}

function rowMatchesTokens(
  row:        ReviewRow,
  tokens:     string[],
  field:      string,
  orgPathMap: Map<string, string>,
): boolean {
  // OR 条件: どれか1つのトークンにマッチすれば通過
  return tokens.some(q => {
    if (field === '__all__') {
      const ro = row.row as Record<string, unknown>
      return Object.values(ro).some(v => v != null && String(v).toLowerCase().includes(q))
        || getSearchStr(row.row, '__orgPath__', orgPathMap).toLowerCase().includes(q)
    }
    return getSearchStr(row.row, field, orgPathMap).toLowerCase().includes(q)
  })
}

export function filterRows(
  rows:       ReviewRow[],
  filter:     UnifiedFilter,
  orgPathMap: Map<string, string>,
): ReviewRow[] {
  let list = rows
  if (filter.changedOnly) list = list.filter(r => r.changes.diffCount > 0)
  if (filter.issuesOnly)  list = list.filter(r => r.issues.length > 0)
  if (filter.activePatterns.size > 0)
    list = list.filter(r => [...filter.activePatterns].some(p => r.activePatterns.has(p)))
  if (filter.activeIssueMessage)
    list = list.filter(r => r.issues.some(i => i.message === filter.activeIssueMessage))
  if (filter.searchText) {
    const tokens = parseSearchTokens(filter.searchText)
    if (tokens.length > 0)
      list = list.filter(r => rowMatchesTokens(r, tokens, filter.searchField, orgPathMap))
  }
  // 詳細条件: フィールドごとに AND 絞り込み（各フィールド内は OR）
  if (filter.fieldConditions) {
    for (const [field, cond] of Object.entries(filter.fieldConditions)) {
      if (!cond?.trim()) continue
      const tokens = parseSearchTokens(cond)
      if (tokens.length === 0) continue
      list = list.filter(r => rowMatchesTokens(r, tokens, field, orgPathMap))
    }
  }
  return list
}

// ── 変更列の計算 ─────────────────────────────────────────────────────────────

export function computeChangedColKeys(rows: ReviewRow[]): Set<keyof AllocationRow> {
  const changed = new Set<keyof AllocationRow>()
  for (const { row } of rows) {
    for (const [afterKey, prevKey] of BEFORE_AFTER_FIELD_PAIRS) {
      if ((row[afterKey] ?? '') !== (row[prevKey] ?? '')) changed.add(afterKey as keyof AllocationRow)
    }
  }
  return changed
}

// ── 問題メッセージ短縮ラベル（≤8文字）────────────────────────────────────────

const ISSUE_LABEL_EXACT: Record<string, string> = {
  '申請区分（異動事由）は必須です':                                                          '異動事由必須',
  '自分自身を上司ポジションに設定できません':                                                  '上司自己参照',
  '配下のポジションを上司に設定できません（循環参照）':                                         '上司循環',
  '組織コードは有効な選択肢から選択してください':                                               '組織コード値',
  'ジョブタイプは有効な選択肢から選択してください':                                             'JT選択肢',
  'ジョブタイプは選択中のジョブファミリーに含まれる値を選択してください':                          'JT不一致',
  '社員番号は7桁の半角数字で入力してください':                                                 '社員番号形式',
  'ポジションコードは「P」+ 8桁半角数字の形式で入力してください（例: P12345678）':               'POS形式',
  'コストセンターは「数字5桁-英数字7桁」の半角大文字で入力してください（例: 12345-AB00001）':    'CC形式',
  'ユーザーIDは半角数字で入力してください':                                                    'UID形式',
  '出向者用組織の場合、出向先会社は必須です':                                                   '出向先必須',
  '出向受入の場合、出向元会社は必須です':                                                      '出向元必須',
  '出向受入の場合、出向元会社社員番号は必須です':                                               '出向元番号',
  '兼務チェックサインが設定されている場合、兼務理由は必須です':                                   '兼務理由必須',
  'フリータイトル対象の役職の場合、フリータイトルは必須です':                                    'FTタイトル',
  '２段階の昇降格が検出されました。問題ないか確認してください':                                   '2段昇降格',
  '出向先会社が入力されている場合、組織コードは出向者用組織を選択してください':                     '出向組織',
  '非組合協定対象者の場合、ポジション＿労働組合員は「非組合員」を選択してください':                  '非組合POS',
  '非組合協定対象者の場合、労働組合員は「非組合員」を選択してください':                            '非組合員値',
  '昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です）': '昇降格POS',
}

export function getIssueShortLabel(message: string): string {
  if (ISSUE_LABEL_EXACT[message]) return ISSUE_LABEL_EXACT[message]
  if (message.startsWith('上司ポジションコード')) return '上司不在'
  if (message.startsWith('ポジションコード') && message.includes('重複')) return 'POS重複'
  if (message.includes('直系上位組織以外')) return '上司組織違'
  if (message.startsWith('勤務場所が組織マスタ')) return '勤務場所違'
  if (message.startsWith('コストセンターが組織マスタ')) return 'CC不一致'
  if (message.includes('が組織マスタの値と異なります')) return '組織値不一致'
  if (message.includes('ユーザーIDが入力されている場合')) return 'UID条件必須'
  if (message.endsWith('は必須です')) {
    const prefix = message.slice(0, message.length - 5)
    return prefix.slice(0, 5) + '必須'
  }
  return message.slice(0, 7) + (message.length > 7 ? '…' : '')
}

// ── 問題グループ ──────────────────────────────────────────────────────────────

export function buildIssueGroups(rows: ReviewRow[]): IssueGroupDef[] {
  const map = new Map<string, IssueGroupDef>()
  for (const { row, issues } of rows) {
    for (const issue of issues) {
      if (!map.has(issue.message)) {
        // 後ろから検索することで、汎用 def より先に特化 def がマッチする
        const resolutionDef = [...RESOLUTION_DEFS].reverse().find(d => d.match(issue))
        map.set(issue.message, {
          message: issue.message,
          field:   String(issue.field),
          level:   issue.level as 'error' | 'warning',
          rowIds:  [],
          resolutionDef,
        })
      }
      map.get(issue.message)!.rowIds.push(row.rowId)
    }
  }
  return [...map.values()].sort((a, b) => b.rowIds.length - a.rowIds.length)
}
