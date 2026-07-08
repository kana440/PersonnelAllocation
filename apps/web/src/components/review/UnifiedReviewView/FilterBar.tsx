import { useState, useEffect, useRef } from 'react'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { NavMode } from '../../../store/reviewFilterStore'
import type { UnifiedFilter, IssueGroupDef } from './types'
import { PATTERN_CHIP_DEFS, parseSearchTokens } from './helpers'
import { FilterDetailPanel } from './FilterDetailPanel'

interface Props {
  filter:              UnifiedFilter
  onFilterChange:      (next: UnifiedFilter) => void
  searchInput:         string
  onSearchInputChange: (v: string) => void
  /** 種別チップの件数バッジ。検索・詳細条件のみ反映済み（activePatterns 自体では狭めない） */
  patternCounts:       Map<EditPattern, number>
  issueGroups:         IssueGroupDef[]
  filteredCount:       number
  totalRows:           number
  changedCount:        number
  masters:             AllMasters
  onOpenBulkModal:     (group: IssueGroupDef) => void
  navMode:             NavMode
  switchNavMode:       (mode: NavMode) => void
  showOldOrg:          boolean
  setShowOldOrg:       (v: boolean) => void
}

export function FilterBar({
  filter, onFilterChange, searchInput, onSearchInputChange,
  patternCounts, issueGroups,
  filteredCount, totalRows, changedCount,
  masters, onOpenBulkModal,
  navMode, switchNavMode, showOldOrg, setShowOldOrg,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const searchRef = useRef<HTMLTextAreaElement>(null)

  const set = (partial: Partial<UnifiedFilter>) => onFilterChange({ ...filter, ...partial })

  const togglePattern = (key: EditPattern) => {
    const next = new Set(filter.activePatterns)
    next.has(key) ? next.delete(key) : next.add(key)
    set({ activePatterns: next })
  }

  // 検索テキストエリアの高さ自動調整
  useEffect(() => {
    const el = searchRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [searchInput])

  const selectedGroup  = issueGroups.find(g => g.key === filter.activeIssueKey) ?? null
  const totalIssueRows = new Set(issueGroups.flatMap(g => g.rowIds)).size
  const tokenCount     = parseSearchTokens(searchInput).length

  const hasFieldConditions = Object.values(filter.fieldConditions ?? {}).some(v => !!v?.trim())

  const clearFieldConditions = () => set({ fieldConditions: {} })

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">

      {/* ── Row A: モード切り替え + 件数 ── */}
      <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
        {/* モード切り替え */}
        <div className="flex rounded overflow-hidden border border-gray-200 flex-shrink-0">
          {(['all', 'changes', 'issues'] as const).map(m => (
            <button key={m} onClick={() => switchNavMode(m)}
              className={`w-20 py-1 text-[10px] font-medium text-center transition-colors ${
                navMode === m
                  ? m === 'issues' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              {m === 'all'     && <>全て{totalRows > 0 && <span className={`ml-1 text-[9px] ${navMode === 'all' ? 'opacity-75' : 'text-gray-400'}`}>{totalRows}</span>}</>}
              {m === 'changes' && <>変更ごと{changedCount  > 0 && <span className={`ml-1 text-[9px] ${navMode === 'changes' ? 'opacity-75' : 'text-blue-500'}`}>{changedCount}</span>}</>}
              {m === 'issues'  && <>要確認{totalIssueRows > 0 && <span className={`ml-1 text-[9px] ${navMode === 'issues'  ? 'opacity-75' : 'text-red-500'}`}>{totalIssueRows}</span>}</>}
            </button>
          ))}
        </div>

        {/* 件数 */}
        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap ml-auto">
          {filteredCount !== totalRows
            ? `${filteredCount.toLocaleString()} / ${totalRows.toLocaleString()} 件`
            : `全 ${totalRows.toLocaleString()} 件`}
          {changedCount > 0 && navMode === 'all' && (
            <span className="ml-1 text-blue-600">（変更 {changedCount}）</span>
          )}
        </span>
      </div>

      {/* ── Row B: 検索 + 組織のグループ化 ── */}
      <div className="flex items-start gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1">
        <div className="relative w-72 flex-shrink-0">
          <textarea
            ref={searchRef}
            value={searchInput}
            onChange={e => onSearchInputChange(e.target.value)}
            placeholder={`氏名・${showOldOrg ? '旧' : '新'}組織を検索…\n（改行でOR）`}
            rows={1}
            style={{ resize: 'none', overflow: 'hidden' }}
            className="w-full text-[11px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 leading-relaxed"
          />
          {tokenCount > 1 && (
            <span className="absolute right-1.5 bottom-1 text-[8px] text-blue-500 pointer-events-none">OR×{tokenCount}</span>
          )}
        </div>
        {searchInput && (
          <button onClick={() => onSearchInputChange('')} className="text-gray-400 hover:text-gray-600 text-xs mt-1 flex-shrink-0">×</button>
        )}
        {/* 組織のグループ化: 新/旧トグル */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">組織のグループ化:</span>
          <div className="flex rounded overflow-hidden border border-gray-300 flex-shrink-0">
            <button
              onClick={() => setShowOldOrg(false)}
              title="新組織でグループ化"
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                !showOldOrg ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              新
            </button>
            <button
              onClick={() => setShowOldOrg(true)}
              title="旧組織でグループ化"
              className={`px-2 py-1 text-[10px] font-medium transition-colors border-l border-gray-300 ${
                showOldOrg ? 'bg-amber-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              旧
            </button>
          </div>
        </div>
        {/* 詳細条件トグル */}
        <button
          onClick={() => setAdvancedOpen(o => !o)}
          title="フィールドごとの詳細検索条件（AND）"
          className={`flex-shrink-0 flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors mt-0 ${
            advancedOpen || hasFieldConditions
              ? 'bg-blue-50 text-blue-700 border-blue-300'
              : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
          }`}
        >
          詳細条件{hasFieldConditions && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
          <span className="ml-0.5">{advancedOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* ── Row C: 詳細条件パネル ── */}
      {advancedOpen && (
        <FilterDetailPanel
          fieldConditions={filter.fieldConditions ?? {}}
          onSetField={(field, value) => set({ fieldConditions: { ...filter.fieldConditions, [field]: value } })}
          onClearAll={clearFieldConditions}
          onClose={() => setAdvancedOpen(false)}
          masters={masters}
        />
      )}

      {/* ── Row D: 変更種別チップ ── */}
      {navMode === 'changes' && (
        <div className="flex items-center gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1 flex-wrap">
          <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap mr-0.5">種別:</span>
          {PATTERN_CHIP_DEFS.map(({ key, label, color, activeColor }) => {
            const cnt    = patternCounts.get(key) ?? 0
            const active = filter.activePatterns.has(key)
            return (
              <button key={key} onClick={() => togglePattern(key)}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                  active    ? activeColor
                  : cnt > 0 ? color
                  :           'bg-gray-50 text-gray-300 border-gray-100 hover:text-gray-400'
                }`}
              >
                {label}{cnt > 0 && <span className="ml-0.5 opacity-60 text-[8px]">{cnt}</span>}
              </button>
            )
          })}
          {filter.activePatterns.size > 0 && (
            <button onClick={() => set({ activePatterns: new Set() })} className="ml-1 text-[9px] text-gray-400 hover:text-gray-600 underline flex-shrink-0">クリア</button>
          )}
        </div>
      )}

      {/* ── Row E: 問題バッジチップ ── */}
      {navMode === 'issues' && (
        issueGroups.length === 0
          ? <div className="px-2 pb-1.5 border-t border-gray-100 pt-1"><span className="text-[10px] text-green-600">問題なし ✓</span></div>
          : (
            <div className="flex items-start gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1 flex-wrap">
              <span className="text-[9px] font-semibold text-red-600 flex-shrink-0 whitespace-nowrap mt-0.5 mr-0.5">問題 {totalIssueRows}件:</span>
              {issueGroups.map(g => {
                const active  = filter.activeIssueKey === g.key
                const isError = g.level === 'error'
                return (
                  <button key={g.message} title={`${g.message}（${g.rowIds.length}件）`}
                    onClick={() => set({ activeIssueKey: active ? '' : g.key })}
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                      active
                        ? isError ? 'bg-red-600 text-white border-red-600' : 'bg-amber-500 text-white border-amber-500'
                        : isError ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {isError ? '⚠ ' : '! '}{g.chipLabel}
                    <span className="ml-0.5 opacity-70">{g.rowIds.length}</span>
                  </button>
                )
              })}
              {selectedGroup && (
                <>
                  <button onClick={() => set({ activeIssueKey: '' })} className="text-[9px] text-gray-400 hover:text-gray-600 mt-0.5">×</button>
                  <button onClick={() => onOpenBulkModal(selectedGroup)}
                    className="px-2.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 transition-colors ml-auto flex-shrink-0"
                  >一括修正 →</button>
                </>
              )}
            </div>
          )
      )}
    </div>
  )
}

