import { useState } from 'react'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ReviewData } from '../hooks/useReviewData'
import type { UnifiedFilter, IssueGroupDef, SearchFieldOption, ViewMode } from './types'
import { getIssueShortLabel, PATTERN_CHIP_DEFS, parseSearchTokens } from './helpers'

interface Props {
  filter:             UnifiedFilter
  onFilterChange:     (next: UnifiedFilter) => void
  searchInput:        string
  onSearchInputChange:(v: string) => void
  viewMode:           ViewMode
  onViewModeChange:   (m: ViewMode) => void
  summary:            ReviewData['summary']
  issueGroups:        IssueGroupDef[]
  searchFields:       SearchFieldOption[]
  filteredCount:      number
  totalRows:          number
  changedCount:       number
  onOpenBulkModal:    (group: IssueGroupDef) => void
}

export function FilterBar({
  filter, onFilterChange, searchInput, onSearchInputChange,
  viewMode, onViewModeChange, summary, issueGroups,
  searchFields, filteredCount, totalRows, changedCount,
  onOpenBulkModal,
}: Props) {
  const [searchExpanded, setSearchExpanded] = useState(false)

  const set = (partial: Partial<UnifiedFilter>) => onFilterChange({ ...filter, ...partial })

  const togglePattern = (key: EditPattern) => {
    const next = new Set(filter.activePatterns)
    next.has(key) ? next.delete(key) : next.add(key)
    set({ activePatterns: next })
  }

  const selectedGroup  = issueGroups.find(g => g.message === filter.activeIssueMessage) ?? null
  const totalIssueRows = new Set(issueGroups.flatMap(g => g.rowIds)).size
  const tokenCount     = parseSearchTokens(searchInput).length


  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">

      {/* ── Row A: 検索 + フィルタ ── */}
      <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
        {/* 表示モード切り替え */}
        <div className="flex rounded overflow-hidden border border-gray-300 flex-shrink-0">
          <button
            onClick={() => onViewModeChange('diff')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
              viewMode === 'diff' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
            }`}
          >コンパクト</button>
          <button
            onClick={() => onViewModeChange('side-by-side')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
              viewMode === 'side-by-side' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
            }`}
          >Excel形式</button>
        </div>

        {/* 検索フィールド選択 */}
        <select
          value={filter.searchField}
          onChange={e => set({ searchField: e.target.value, searchText: '' })}
          className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 flex-shrink-0 max-w-[9rem]"
        >
          {searchFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {/* 検索テキスト（展開可能 textarea / 複数名コピペ → OR 検索） */}
        <div className="flex items-start gap-1 flex-1 min-w-[6rem]">
          {searchExpanded ? (
            <textarea
              value={searchInput}
              onChange={e => onSearchInputChange(e.target.value)}
              placeholder={"氏名を1行1件で貼り付け…\n（スペース・カンマ・改行でOR条件）"}
              rows={4}
              autoFocus
              className="flex-1 border border-blue-400 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none leading-relaxed"
            />
          ) : (
            <input
              type="text"
              value={searchInput}
              onChange={e => onSearchInputChange(e.target.value)}
              placeholder="検索… (スペース/改行でOR)"
              className="flex-1 border border-gray-300 rounded px-2 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          )}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              onClick={() => setSearchExpanded(p => !p)}
              title={searchExpanded ? '検索欄を折りたたむ' : '複数名を貼り付けて一括OR検索'}
              className="text-gray-400 hover:text-blue-600 text-[10px] leading-none px-0.5"
            >{searchExpanded ? '▲' : '⊞'}</button>
            {searchInput && (
              <button
                onClick={() => { onSearchInputChange(''); set({ searchText: '' }); setSearchExpanded(false) }}
                className="text-gray-400 hover:text-gray-600 text-xs leading-none"
              >×</button>
            )}
          </div>
        </div>
        {/* OR トークン数の表示 */}
        {tokenCount > 1 && (
          <span className="text-[9px] text-blue-600 flex-shrink-0 whitespace-nowrap">OR×{tokenCount}</span>
        )}

        {/* 件数 */}
        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
          {filteredCount !== totalRows
            ? `${filteredCount.toLocaleString()} / ${totalRows.toLocaleString()} 件`
            : `全 ${totalRows.toLocaleString()} 件`}
          {changedCount > 0 && <span className="ml-1 text-blue-600">（変更 {changedCount}）</span>}
        </span>

        {/* チェックボックスフィルタ */}
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none flex-shrink-0">
          <input type="checkbox" checked={filter.changedOnly} onChange={e => set({ changedOnly: e.target.checked })} />変更あり
        </label>
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none flex-shrink-0">
          <input type="checkbox" checked={filter.issuesOnly} onChange={e => set({ issuesOnly: e.target.checked })} />問題あり
        </label>
      </div>

      {/* ── Row B: 変更種別バッジ ── */}
      <div className="flex items-center gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1 flex-wrap">
        <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap mr-0.5">種別:</span>
        {PATTERN_CHIP_DEFS.map(({ key, label, color }) => {
          const cnt    = summary.byPattern.get(key) ?? 0
          const active = filter.activePatterns.has(key)
          return (
            <button
              key={key}
              onClick={() => togglePattern(key)}
              className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                active
                  ? color
                  : cnt > 0
                    ? 'bg-gray-100 text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
                    : 'bg-gray-50 text-gray-300 border-gray-100 hover:text-gray-400'
              }`}
            >
              {label}
              {cnt > 0 && <span className="ml-0.5 opacity-60 text-[8px]">{cnt}</span>}
            </button>
          )
        })}
        {filter.activePatterns.size > 0 && (
          <button
            onClick={() => set({ activePatterns: new Set() })}
            className="ml-1 text-[9px] text-gray-400 hover:text-gray-600 underline flex-shrink-0"
          >
            クリア
          </button>
        )}
      </div>

      {/* ── Row C: 問題フィルタ + 一括修正（問題がある場合のみ）── */}
      {issueGroups.length > 0 && (
        <div className="flex items-center gap-2 px-2 pb-1.5 border-t border-gray-100 pt-1">
          <span className="text-[9px] font-semibold text-red-600 flex-shrink-0 whitespace-nowrap">
            問題 {totalIssueRows}件
          </span>
          <select
            value={filter.activeIssueMessage}
            onChange={e => set({ activeIssueMessage: e.target.value })}
            className={`flex-1 text-[10px] border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 min-w-0 ${
              filter.activeIssueMessage
                ? 'border-red-300 focus:ring-red-300 text-red-700'
                : 'border-gray-300 focus:ring-gray-300 text-gray-600'
            }`}
          >
            <option value="">カテゴリを選択...</option>
            {issueGroups.map(g => (
              <option key={g.message} value={g.message} title={g.message}>
                {g.level === 'error' ? '[E]' : '[W]'} {g.resolutionDef?.shortLabel ?? getIssueShortLabel(g.message)} ({g.rowIds.length})
              </option>
            ))}
          </select>
          {filter.activeIssueMessage && (
            <button
              onClick={() => set({ activeIssueMessage: '' })}
              className="flex-shrink-0 text-[9px] text-gray-400 hover:text-gray-600"
            >×</button>
          )}
          <button
            onClick={() => { if (selectedGroup) onOpenBulkModal(selectedGroup) }}
            disabled={!selectedGroup}
            className={`flex-shrink-0 px-2.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap transition-colors ${
              selectedGroup
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            一括修正 →
          </button>
        </div>
      )}
    </div>
  )
}
