import type { AllocationRow } from '@personnel/domain/allocationRow'
import { BEFORE_AFTER_FIELD_PAIRS } from '@personnel/domain/allocationRow'
import { RESOLUTION_DEFS } from '@personnel/domain/rules/resolve'
import { resolveIssueMeta } from '@personnel/domain/rules/validate/issueTypeMeta'
import type { ReviewRow } from '../hooks/useReviewData'
import type { UnifiedFilter, IssueGroupDef } from './types'
export { PATTERN_CHIP_DEFS, PATTERN_LABEL_MAP } from '../../common/patternChips'

// ── フィルタ ─────────────────────────────────────────────────────────────────

// 全角英数記号→半角に変換（検索での全角半角曖昧マッチ用）
export function normalizeToHalf(s: string): string {
  return s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
          .replace(/　/g, ' ')
}

function getSearchStr(row: AllocationRow, field: string, orgPathMap: Map<string, string>): string {
  if (field === '__name__')    return [row.lastName, row.firstName].filter(Boolean).join(' ')
  if (field === '__orgPath__') return orgPathMap.get((row.departmentCode as string | undefined) ?? '') ?? ''
  return String((row as Record<string, unknown>)[field] ?? '')
}

/**
 * スペース・カンマ・改行（全角含む）で区切った OR 検索トークン列を返す。
 * 全角英数記号を半角に統一してから返す。
 */
export function parseSearchTokens(query: string): string[] {
  return query.split(/[\s,\n\r，　]+/)
    .map(t => normalizeToHalf(t.trim()).toLowerCase())
    .filter(Boolean)
}

function rowMatchesTokens(
  row:        ReviewRow,
  tokens:     string[],
  field:      string,
  orgPathMap: Map<string, string>,
): boolean {
  // OR 条件: どれか1つのトークンにマッチすれば通過（トークンは normalizeToHalf + lowercase 済み）
  return tokens.some(q => {
    if (field === '__all__') {
      const ro = row.row as Record<string, unknown>
      return Object.values(ro).some(v => v != null && normalizeToHalf(String(v)).toLowerCase().includes(q))
        || normalizeToHalf(getSearchStr(row.row, '__orgPath__', orgPathMap)).toLowerCase().includes(q)
    }
    return normalizeToHalf(getSearchStr(row.row, field, orgPathMap)).toLowerCase().includes(q)
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
  if (filter.activeIssueKey)
    list = list.filter(r => r.issues.some(i => issueGroupKey(i) === filter.activeIssueKey))
  if (filter.searchText) {
    const tokens = parseSearchTokens(filter.searchText)
    if (tokens.length > 0)
      list = list.filter(r => rowMatchesTokens(r, tokens, filter.searchField, orgPathMap))
  }
  // 詳細条件: フィールドごとに AND 絞り込み（各フィールド内は OR）
  if (filter.fieldConditions) {
    for (const [field, cond] of Object.entries(filter.fieldConditions)) {
      if (!cond?.trim()) continue
      // フラグ型センチネル: '!!true' = 値あり、'!!false' = 値なし
      if (cond === '!!true') {
        list = list.filter(r => !!(r.row as Record<string, unknown>)[field])
        continue
      }
      if (cond === '!!false') {
        list = list.filter(r => !(r.row as Record<string, unknown>)[field])
        continue
      }
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
// chipLabel の単一ソースは IssueTypeMeta.chipLabel。ここはフォールバック付きラッパー。

export function getIssueShortLabel(message: string): string {
  const meta = resolveIssueMeta({ field: '' as never, level: 'error', message })
  if (meta) return meta.chipLabel
  // IssueTypeMeta に登録されていない未知のメッセージのフォールバック
  if (message.endsWith('は必須です')) {
    return message.slice(0, message.length - 5).slice(0, 5) + '必須'
  }
  return message.slice(0, 7) + (message.length > 7 ? '…' : '')
}

// ── 問題グループ ──────────────────────────────────────────────────────────────

/** グルーピングキー: id がある場合は `${id}::${field}`、ない場合は message にフォールバック */
function issueGroupKey(issue: { id?: string; field: unknown; message: string }): string {
  return issue.id ? `${issue.id}::${String(issue.field)}` : issue.message
}

export function buildIssueGroups(rows: ReviewRow[]): IssueGroupDef[] {
  const map = new Map<string, IssueGroupDef>()
  for (const { row, issues } of rows) {
    for (const issue of issues) {
      const key = issueGroupKey(issue)
      if (!map.has(key)) {
        map.set(key, {
          key,
          message:        issue.message,
          field:          String(issue.field),
          level:          issue.level as 'error' | 'warning',
          rowIds:         [],
          suggestedPatch: issue.suggestedPatch,
          resolutionDefs: RESOLUTION_DEFS.filter(d => d.match(issue)),
        })
      }
      map.get(key)!.rowIds.push(row.rowId)
    }
  }
  return [...map.values()].sort((a, b) => b.rowIds.length - a.rowIds.length)
}
