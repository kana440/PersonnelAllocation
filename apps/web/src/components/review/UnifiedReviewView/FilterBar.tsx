import { useState, useEffect, useRef } from 'react'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ReviewData } from '../hooks/useReviewData'
import type { UnifiedFilter, IssueGroupDef, SearchFieldOption } from './types'
import { getIssueShortLabel, PATTERN_CHIP_DEFS, parseSearchTokens } from './helpers'

type NavMode = 'all' | 'changes' | 'issues'

interface Props {
  filter:              UnifiedFilter
  onFilterChange:      (next: UnifiedFilter) => void
  searchInput:         string
  onSearchInputChange: (v: string) => void
  summary:             ReviewData['summary']
  issueGroups:         IssueGroupDef[]
  searchFields:        SearchFieldOption[]
  filteredCount:       number
  totalRows:           number
  changedCount:        number
  onOpenBulkModal:     (group: IssueGroupDef) => void
}

export function FilterBar({
  filter, onFilterChange, searchInput, onSearchInputChange,
  summary, issueGroups,
  searchFields, filteredCount, totalRows, changedCount,
  onOpenBulkModal,
}: Props) {
  const [uiMode,       setUiMode]       = useState<NavMode>('all')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const searchRef = useRef<HTMLTextAreaElement>(null)

  const set = (partial: Partial<UnifiedFilter>) => onFilterChange({ ...filter, ...partial })

  const switchMode = (mode: NavMode) => {
    setUiMode(mode)
    if (mode === 'all') {
      set({ changedOnly: false, issuesOnly: false, activePatterns: new Set(), activeIssueMessage: '' })
    } else if (mode === 'changes') {
      set({ changedOnly: true, issuesOnly: false, activeIssueMessage: '' })
    } else {
      set({ issuesOnly: true, changedOnly: false, activePatterns: new Set() })
    }
  }

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
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }, [searchInput])

  const selectedGroup  = issueGroups.find(g => g.message === filter.activeIssueMessage) ?? null
  const totalIssueRows = new Set(issueGroups.flatMap(g => g.rowIds)).size
  const tokenCount     = parseSearchTokens(searchInput).length

  // 詳細条件用フィールド（特殊キーは除外）
  const detailFields = searchFields.filter(f => !f.value.startsWith('__'))
  const hasFieldConditions = Object.values(filter.fieldConditions ?? {}).some(v => !!v?.trim())

  const clearFieldConditions = () => set({ fieldConditions: {} })

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">

      {/* ── Row A: モード切り替え + 件数 ── */}
      <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
        {/* モード切り替え */}
        <div className="flex rounded overflow-hidden border border-gray-200 flex-shrink-0">
          {(['all', 'changes', 'issues'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                uiMode === m
                  ? m === 'issues' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              {m === 'all'     && '全体'}
              {m === 'changes' && <>変更{changedCount  > 0 && <span className={`ml-1 text-[9px] ${uiMode === 'changes' ? 'opacity-75' : 'text-blue-500'}`}>{changedCount}</span>}</>}
              {m === 'issues'  && <>問題{totalIssueRows > 0 && <span className={`ml-1 text-[9px] ${uiMode === 'issues'  ? 'opacity-75' : 'text-red-500'}`}>{totalIssueRows}</span>}</>}
            </button>
          ))}
        </div>

        {/* 件数 */}
        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap ml-auto">
          {filteredCount !== totalRows
            ? `${filteredCount.toLocaleString()} / ${totalRows.toLocaleString()} 件`
            : `全 ${totalRows.toLocaleString()} 件`}
          {changedCount > 0 && uiMode === 'all' && (
            <span className="ml-1 text-blue-600">（変更 {changedCount}）</span>
          )}
        </span>
      </div>

      {/* ── Row B: 全文検索テキストエリア ── */}
      <div className="flex items-start gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1">
        <div className="relative flex-1">
          <textarea
            ref={searchRef}
            value={searchInput}
            onChange={e => onSearchInputChange(e.target.value)}
            placeholder="全文検索…（改行/スペース/カンマでOR条件）"
            rows={1}
            style={{ resize: 'none', overflow: 'hidden' }}
            className="w-full text-[10px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 leading-relaxed"
          />
          {tokenCount > 1 && (
            <span className="absolute right-1.5 bottom-1 text-[8px] text-blue-500 pointer-events-none">OR×{tokenCount}</span>
          )}
        </div>
        {searchInput && (
          <button onClick={() => onSearchInputChange('')} className="text-gray-400 hover:text-gray-600 text-xs mt-1 flex-shrink-0">×</button>
        )}
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
        <div className="px-2 pb-2 border-t border-blue-100 bg-blue-50/30">
          <div className="flex items-center gap-1 py-1 mb-0.5">
            <span className="text-[9px] font-semibold text-blue-700 flex-1">詳細条件（AND 絞り込み）</span>
            <button onClick={clearFieldConditions} disabled={!hasFieldConditions}
              className="text-[9px] text-gray-400 hover:text-red-600 disabled:opacity-30 underline"
            >全クリア</button>
            <button onClick={() => setAdvancedOpen(false)} className="text-[9px] text-gray-400 hover:text-gray-700 ml-1">▲ 畳む</button>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 max-h-60 overflow-y-auto">
            {/* 氏名・組織（特殊フィールド）を先頭に */}
            {[
              { value: '__name__',    label: '氏名' },
              { value: '__orgPath__', label: '組織（階層）' },
              ...detailFields,
            ].map(f => (
              <div key={f.value} className="flex items-start gap-1">
                <label className="text-[9px] text-gray-500 pt-1 w-14 flex-shrink-0 truncate" title={f.label}>{f.label}</label>
                <FieldConditionInput
                  value={filter.fieldConditions?.[f.value] ?? ''}
                  onChange={v => set({ fieldConditions: { ...filter.fieldConditions, [f.value]: v } })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row D: 変更種別チップ ── */}
      {uiMode === 'changes' && (
        <div className="flex items-center gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1 flex-wrap">
          <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap mr-0.5">種別:</span>
          {PATTERN_CHIP_DEFS.map(({ key, label, color }) => {
            const cnt    = summary.byPattern.get(key) ?? 0
            const active = filter.activePatterns.has(key)
            return (
              <button key={key} onClick={() => togglePattern(key)}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                  active    ? color
                  : cnt > 0 ? 'bg-gray-100 text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
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
      {uiMode === 'issues' && (
        issueGroups.length === 0
          ? <div className="px-2 pb-1.5 border-t border-gray-100 pt-1"><span className="text-[10px] text-green-600">問題なし ✓</span></div>
          : (
            <div className="flex items-start gap-1 px-2 pb-1.5 border-t border-gray-100 pt-1 flex-wrap">
              <span className="text-[9px] font-semibold text-red-600 flex-shrink-0 whitespace-nowrap mt-0.5 mr-0.5">問題 {totalIssueRows}件:</span>
              {issueGroups.map(g => {
                const active  = filter.activeIssueMessage === g.message
                const isError = g.level === 'error'
                return (
                  <button key={g.message} title={`${g.message}（${g.rowIds.length}件）`}
                    onClick={() => set({ activeIssueMessage: active ? '' : g.message })}
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                      active
                        ? isError ? 'bg-red-600 text-white border-red-600' : 'bg-amber-500 text-white border-amber-500'
                        : isError ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {isError ? '⚠' : '!'} {g.resolutionDef?.shortLabel ?? getIssueShortLabel(g.message)}
                    <span className="ml-0.5 opacity-70">{g.rowIds.length}</span>
                  </button>
                )
              })}
              {selectedGroup && (
                <>
                  <button onClick={() => set({ activeIssueMessage: '' })} className="text-[9px] text-gray-400 hover:text-gray-600 mt-0.5">×</button>
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

// 詳細条件の各フィールド入力（auto-expand）
function FieldConditionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 60)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={1}
      style={{ resize: 'none', overflow: 'hidden' }}
      className="flex-1 text-[9px] border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-200 leading-relaxed bg-white min-w-0"
    />
  )
}
