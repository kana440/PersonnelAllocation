import { useMemo, useCallback, useState, useRef }  from 'react'
import { useShallow }               from 'zustand/react/shallow'
import { useStore }                 from '../../../store/useStore'
import { useReviewFilterStore }     from '../../../store/reviewFilterStore'
import { useRowSelectionStore }     from '../../../store/rowSelectionStore'
import { useCanvasPanelNav }        from './useCanvasPanelNav'
import { PATTERN_CHIP_DEFS, getIssueShortLabel } from '../../review/UnifiedReviewView/helpers'
import { SelectionActionBar }       from '../../review/UnifiedReviewView/SelectionActionBar'
import { BulkFieldEditModal }       from '../../review/components/BulkFieldEditModal'
import { OrgSection }               from './OrgSection'
import { useCompactData }           from './useCompactData'
import type { IssueGroupDef }       from '../../review/UnifiedReviewView/types'
import type { EditPattern }         from '@personnel/domain/patterns/editPattern'

const SUMMARY_PATTERNS: EditPattern[] = [
  'orgTransfer', 'orgRestructure', 'promotion', 'demotion',
  'secondmentOut', 'secondmentIn', 'leaveOfAbsence', 'termination',
]

interface Props {
  onDoubleClick: (rowId: number) => void
}

export function OrgPersonNav({ onDoubleClick }: Props) {
  const enterOperationPanel = useStore(s => s.enterOperationPanel)

  // useScopedStore() はセレクタなしで全ストアを購読するため使わない
  const allocationList     = useStore(s => s.allocationList)
  const afterOrganizations = useStore(s => s.afterOrganizations)

  const { selectedRowIds, toggleAll, setRows, clearSelection } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, toggleAll: s.toggleAll, setRows: s.setRows, clearSelection: s.clearSelection }))
  )

  const { handlePersonClick, handleOrgClick } = useCanvasPanelNav(afterOrganizations, () => {})

  // useReviewFilterStore をまとめて読む際は useShallow で参照等値チェック
  const {
    searchInput, showOldOrg, showMembersOnly,
    setSearchInput, setShowOldOrg, setShowMembersOnly,
  } = useReviewFilterStore(useShallow(s => ({
    searchInput:        s.searchInput,
    showOldOrg:         s.showOldOrg,
    showMembersOnly:    s.showMembersOnly,
    setSearchInput:     s.setSearchInput,
    setShowOldOrg:      s.setShowOldOrg,
    setShowMembersOnly: s.setShowMembersOnly,
  })))

  // filter フィールドは別途単独セレクタで取得（activePatterns の Set 変化を個別に検知）
  const activePatterns = useReviewFilterStore(s => s.filter.activePatterns)
  const issuesOnly     = useReviewFilterStore(s => s.filter.issuesOnly)
  const changedOnly    = useReviewFilterStore(s => s.filter.changedOnly)
  const patchFilter    = useReviewFilterStore(s => s.patchFilter)

  const { sections, totalCount, changedCount, patternCounts, filteredRowIds, issueGroups } = useCompactData()

  // 問題バッジから一括修正モーダルを開く
  const [bulkModal, setBulkModal] = useState<IssueGroupDef | null>(null)

  // afterOrganizations の Map はクリックごとに再構築しないよう memoize
  const afterOrgByExt = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )

  const summaryBadges = useMemo(
    () => SUMMARY_PATTERNS
      .map(p => ({ ...PATTERN_CHIP_DEFS.find(d => d.key === p)!, count: patternCounts[p] ?? 0 })),
    [patternCounts],
  )

  const togglePattern = useCallback((key: EditPattern) => {
    const next = new Set(activePatterns)
    next.has(key) ? next.delete(key) : next.add(key)
    patchFilter({ activePatterns: next })
  }, [activePatterns, patchFilter])

  const handlePersonFocus = useCallback((rowId: number) => {
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return
    const org = row.departmentCode ? afterOrgByExt.get(String(row.departmentCode)) : undefined
    handlePersonClick(rowId, org?.id ?? '')
  }, [handlePersonClick, allocationList, afterOrgByExt])

  const handleOrgFocus = useCallback((orgId: string) => {
    handleOrgClick(orgId)
  }, [handleOrgClick])

  const handleDoubleClick = useCallback((rowId: number) => {
    enterOperationPanel(rowId, 'summary')
    onDoubleClick(rowId)
  }, [enterOperationPanel, onDoubleClick])

  // 全選択チェックボックスの状態
  const allSelected  = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
  const someSelected = filteredRowIds.some(id => selectedRowIds.has(id)) && !allSelected
  const selectAllRef = useRef<HTMLInputElement>(null)
  // indeterminate は ref で設定（React の controlled prop にない）
  if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected

  const activeFilterCount =
    activePatterns.size +
    (issuesOnly       ? 1 : 0) +
    (changedOnly      ? 1 : 0) +
    (showMembersOnly  ? 1 : 0)

  const hasActiveFilter = !!searchInput || activeFilterCount > 0

  return (
    <div className="flex flex-col h-full overflow-hidden text-[11px]">

      {/* 検索バー */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1 space-y-1 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="氏名・組織を検索… (スペース/改行でOR)"
            className="flex-1 text-[11px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 min-w-0"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
              title="クリア"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => setShowOldOrg(!showOldOrg)}
            title={showOldOrg ? '旧組織でグループ中（クリックで新組織へ）' : '新組織でグループ中（クリックで旧組織へ）'}
            className={`flex-shrink-0 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${
              showOldOrg
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
            }`}
          >
            {showOldOrg ? '旧' : '新'}
          </button>
        </div>

        {/* サマリ行 + 全選択 */}
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
          {/* 全選択チェックボックス */}
          <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none" title="フィルタ結果を全選択 / 全解除">
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
          <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
            {totalCount}人
            {changedCount > 0 && <span className="text-blue-600 ml-1">/ {changedCount}変更</span>}
          </span>
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowMembersOnly(!showMembersOnly)}
              title={showMembersOnly ? '直接メンバーがいる組織のみ表示中（クリックで全組織表示）' : '全組織を表示中（クリックで有人のみへ）'}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors whitespace-nowrap ${
                showMembersOnly
                  ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                  : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {showMembersOnly ? '有人のみ' : '全組織'}
            </button>
            <label className="flex items-center gap-0.5 text-[10px] text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={changedOnly} onChange={e => patchFilter({ changedOnly: e.target.checked })} className="accent-blue-600 pointer-events-none" />
              変更
            </label>
            <label className="flex items-center gap-0.5 text-[10px] text-red-600 cursor-pointer select-none">
              <input type="checkbox" checked={issuesOnly} onChange={e => patchFilter({ issuesOnly: e.target.checked })} className="accent-red-500 pointer-events-none" />
              問題
            </label>
          </div>
        </div>

        {/* 変更種別フィルタ */}
        <div className="flex flex-wrap gap-0.5">
          {summaryBadges.map(b => {
            const active = activePatterns.has(b.key)
            return (
              <button
                key={b.key}
                onClick={() => togglePattern(b.key)}
                className={`px-1 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                  active
                    ? b.color
                    : b.count > 0
                      ? 'bg-gray-100 text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
                      : 'bg-gray-50 text-gray-300 border-gray-100'
                }`}
              >
                {b.label}
                {b.count > 0 && <span className="ml-0.5 opacity-60">{b.count}</span>}
              </button>
            )
          })}
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                patchFilter({ activePatterns: new Set(), issuesOnly: false, changedOnly: false })
                setShowMembersOnly(true)
              }}
              className="px-1 py-0.5 text-[9px] text-gray-400 hover:text-gray-700 underline"
            >
              クリア
            </button>
          )}
        </div>

        {/* 問題バッジ（クリック → その問題行を全選択 → 一括修正） */}
        {issueGroups.length > 0 && (
          <div className="flex flex-wrap gap-0.5 pt-0.5 border-t border-gray-100">
            {issueGroups.map(g => (
              <button
                key={g.message}
                title={`${g.message}（${g.rowIds.length}件）— クリックで選択 + 一括修正`}
                onClick={() => { setRows(g.rowIds); setBulkModal(g) }}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-medium transition-all whitespace-nowrap ${
                  g.level === 'error'
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {g.level === 'error' ? '⚠' : '!'} {g.resolutionDef?.shortLabel ?? getIssueShortLabel(g.message)} {g.rowIds.length}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 選択時操作バー */}
      {selectedRowIds.size > 0 && <SelectionActionBar />}

      {/* セクションリスト */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sections.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-gray-400">
            {hasActiveFilter ? '該当なし' : 'データなし'}
          </div>
        )}
        {sections.map(section => (
          <OrgSection
            key={`${section.orgCode || '__none__'}_${section.isUnmapped}`}
            section={section}
            onOrgClick={handleOrgFocus}
            onPersonFocus={handlePersonFocus}
            onDoubleClick={handleDoubleClick}
          />
        ))}
      </div>

      {/* 問題一括修正モーダル */}
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
