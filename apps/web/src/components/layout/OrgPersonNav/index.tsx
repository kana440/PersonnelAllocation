import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { useShallow }             from 'zustand/react/shallow'
import { useStore }               from '../../../store/useStore'
import { useReviewFilterStore }   from '../../../store/reviewFilterStore'
import { useRowSelectionStore }   from '../../../store/rowSelectionStore'
import { useCanvasPanelNav }      from './useCanvasPanelNav'
import { PATTERN_CHIP_DEFS }       from '../../common/patternChips'
import { getIssueShortLabel }      from '../../review/UnifiedReviewView/helpers'
import { BulkFieldEditModal }     from '../../review/components/BulkFieldEditModal'
import { OrgSection }             from './OrgSection'
import { useCompactData }         from './useCompactData'
import type { IssueGroupDef }     from '../../review/UnifiedReviewView/types'
import type { EditPattern }       from '@personnel/domain/patterns/editPattern'

type NavMode = 'all' | 'changes' | 'issues'

const CHANGE_PATTERNS: EditPattern[] = [
  'orgTransfer', 'orgRestructure', 'promotion', 'demotion',
  'secondmentOut', 'secondmentIn', 'leaveOfAbsence', 'termination',
]

interface Props {
  onDoubleClick: (rowId: number) => void
}

export function OrgPersonNav({ onDoubleClick }: Props) {
  const enterOperationPanel = useStore(s => s.enterOperationPanel)
  const allocationList      = useStore(s => s.allocationList)
  const afterOrganizations  = useStore(s => s.afterOrganizations)

  const { selectedRowIds, toggleAll, setRows, clearSelection } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, toggleAll: s.toggleAll, setRows: s.setRows, clearSelection: s.clearSelection }))
  )

  const { handlePersonClick, handleOrgClick } = useCanvasPanelNav(afterOrganizations, () => {})

  const {
    searchInput, showOldOrg, showMembersOnly,
    setSearchInput, setShowOldOrg, setShowMembersOnly,
  } = useReviewFilterStore(useShallow(s => ({
    searchInput: s.searchInput, showOldOrg: s.showOldOrg, showMembersOnly: s.showMembersOnly,
    setSearchInput: s.setSearchInput, setShowOldOrg: s.setShowOldOrg, setShowMembersOnly: s.setShowMembersOnly,
  })))

  const activePatterns     = useReviewFilterStore(s => s.filter.activePatterns)
  const activeIssueMessage = useReviewFilterStore(s => s.filter.activeIssueMessage)
  const patchFilter        = useReviewFilterStore(s => s.patchFilter)

  const { sections, totalCount, changedCount, patternCounts, filteredRowIds, issueGroups } = useCompactData()

  const [navMode,   setNavMode]   = useState<NavMode>('all')
  const [bulkModal, setBulkModal] = useState<IssueGroupDef | null>(null)
  const searchRef = useRef<HTMLTextAreaElement>(null)

  // 検索テキストエリアの高さ自動調整
  useEffect(() => {
    const el = searchRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [searchInput])

  const switchMode = useCallback((mode: NavMode) => {
    setNavMode(mode)
    if (mode === 'all') {
      patchFilter({ changedOnly: false, issuesOnly: false, activePatterns: new Set(), activeIssueMessage: '' })
    } else if (mode === 'changes') {
      patchFilter({ changedOnly: true, issuesOnly: false, activeIssueMessage: '' })
    } else {
      patchFilter({ issuesOnly: true, changedOnly: false, activePatterns: new Set(), activeIssueMessage: '' })
    }
  }, [patchFilter])

  const afterOrgByExt = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )

  const patternBadges = useMemo(
    () => CHANGE_PATTERNS.map(p => ({ ...PATTERN_CHIP_DEFS.find(d => d.key === p)!, count: patternCounts[p] ?? 0 })),
    [patternCounts],
  )

  const togglePattern = useCallback((key: EditPattern) => {
    const next = new Set(activePatterns)
    next.has(key) ? next.delete(key) : next.add(key)
    patchFilter({ activePatterns: next })
  }, [activePatterns, patchFilter])

  const selectedIssueGroup = useMemo(
    () => issueGroups.find(g => g.message === activeIssueMessage) ?? null,
    [issueGroups, activeIssueMessage],
  )

  const handlePersonFocus = useCallback((rowId: number) => {
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return
    const org = row.departmentCode ? afterOrgByExt.get(String(row.departmentCode)) : undefined
    handlePersonClick(rowId, org?.id ?? '')
  }, [handlePersonClick, allocationList, afterOrgByExt])

  const handleDoubleClick = useCallback((rowId: number) => {
    enterOperationPanel(rowId, 'summary')
    onDoubleClick(rowId)
  }, [enterOperationPanel, onDoubleClick])

  const allSelected  = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
  const someSelected = filteredRowIds.some(id => selectedRowIds.has(id)) && !allSelected
  const selectAllRef = useRef<HTMLInputElement>(null)
  if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected

  const issueRowCount = useMemo(
    () => new Set(issueGroups.flatMap(g => g.rowIds)).size,
    [issueGroups],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden text-[11px]">

      {/* ヘッダー */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-2 pt-2 pb-1.5 space-y-1.5">

        {/* モード切り替え */}
        <div className="flex rounded overflow-hidden border border-gray-200">
          {(['all', 'changes', 'issues'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-0.5 text-[10px] font-medium transition-colors ${
                navMode === m
                  ? m === 'issues' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m === 'all'     && '全体'}
              {m === 'changes' && <>変更{changedCount  > 0 && <span className={`ml-1 text-[9px] ${navMode === 'changes' ? 'opacity-75' : 'text-blue-500'}`}>{changedCount}</span>}</>}
              {m === 'issues'  && <>問題{issueRowCount > 0 && <span className={`ml-1 text-[9px] ${navMode === 'issues'  ? 'opacity-75' : 'text-red-500'}`}>{issueRowCount}</span>}</>}
            </button>
          ))}
        </div>

        {/* 検索 + 新/旧 */}
        <div className="flex items-start gap-1">
          <div className="relative flex-1 min-w-0">
            <textarea
              ref={searchRef}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={"氏名・組織を検索…\n（改行でOR）"}
              rows={1}
              style={{ resize: 'none', overflow: 'hidden' }}
              className="w-full text-[11px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 leading-relaxed"
            />
          </div>
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 mt-1">✕</button>
          )}
          <button
            onClick={() => setShowOldOrg(!showOldOrg)}
            title={showOldOrg ? '旧組織でグループ中' : '新組織でグループ中'}
            className={`flex-shrink-0 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors mt-0 ${
              showOldOrg ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
            }`}
          >
            {showOldOrg ? '旧' : '新'}
          </button>
        </div>

        {/* 変更モード: 種別チップ */}
        {navMode === 'changes' && (
          <div className="flex flex-wrap gap-0.5">
            {patternBadges.map(b => {
              const active = activePatterns.has(b.key)
              return (
                <button
                  key={b.key}
                  onClick={() => togglePattern(b.key)}
                  className={`px-1 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                    active        ? b.color
                    : b.count > 0 ? 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-50'
                    :               'bg-gray-50 text-gray-300 border-gray-100'
                  }`}
                >
                  {b.label}{b.count > 0 && <span className="ml-0.5 opacity-60">{b.count}</span>}
                </button>
              )
            })}
            {activePatterns.size > 0 && (
              <button onClick={() => patchFilter({ activePatterns: new Set() })} className="text-[9px] text-gray-400 hover:text-gray-700 underline">
                クリア
              </button>
            )}
          </div>
        )}

        {/* 問題モード: 問題チップ（フィルタ適用のみ） */}
        {navMode === 'issues' && (
          issueGroups.length === 0
            ? <p className="text-[10px] text-green-600 py-0.5">問題なし ✓</p>
            : <div className="space-y-1">
                <div className="flex flex-wrap gap-0.5 max-h-24 overflow-y-auto">
                  {issueGroups.map(g => {
                    const active  = activeIssueMessage === g.message
                    const isError = g.level === 'error'
                    return (
                      <button
                        key={g.message}
                        title={`${g.message}（${g.rowIds.length}件）`}
                        onClick={() => patchFilter({ activeIssueMessage: active ? '' : g.message })}
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                          active
                            ? isError ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-amber-500 text-white border-amber-500'
                            : isError ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {isError ? '⚠' : '!'} {g.resolutionDef?.shortLabel ?? getIssueShortLabel(g.message)} {g.rowIds.length}
                      </button>
                    )
                  })}
                </div>
                {/* 一括修正ボタン: チップ選択時のみ */}
                {selectedIssueGroup && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => patchFilter({ activeIssueMessage: '' })}
                      className="text-[9px] text-gray-400 hover:text-gray-600"
                    >×</button>
                    <button
                      onClick={() => { setRows(selectedIssueGroup.rowIds); setBulkModal(selectedIssueGroup) }}
                      className="flex-1 py-0.5 rounded text-[9px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      一括修正 →
                    </button>
                  </div>
                )}
              </div>
        )}

        {/* 全選択 + カウント */}
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={() => toggleAll(filteredRowIds)}
              className="accent-blue-600"
            />
            全選択
          </label>
          <span className="text-[10px] text-gray-400">|</span>
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            {totalCount}人
            {navMode === 'changes' && changedCount > 0 && <span className="text-blue-600 ml-1">（{changedCount}変更）</span>}
          </span>
          {navMode === 'all' && (
            <button
              onClick={() => setShowMembersOnly(!showMembersOnly)}
              className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors whitespace-nowrap ${
                showMembersOnly
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {showMembersOnly ? '有人のみ' : '全組織'}
            </button>
          )}
        </div>
      </div>

      {/* セクションリスト */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sections.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-gray-400">
            {navMode === 'issues' ? '問題のある人はいません' : '該当なし'}
          </div>
        )}
        {sections.map(section => (
          <OrgSection
            key={`${section.orgCode || '__none__'}_${section.isUnmapped}`}
            section={section}
            onOrgClick={handleOrgClick}
            onPersonFocus={handlePersonFocus}
            onDoubleClick={handleDoubleClick}
          />
        ))}
      </div>

      {bulkModal && (
        <BulkFieldEditModal
          field={bulkModal.field}
          rowIds={bulkModal.rowIds}
          resolutionDef={bulkModal.resolutionDef}
          onClose={() => { setBulkModal(null); clearSelection() }}
        />
      )}
    </div>
  )
}
