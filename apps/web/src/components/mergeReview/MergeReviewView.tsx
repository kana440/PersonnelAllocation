import { useState, useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../store/useStore'
import { useMergeReviewData } from '../review/hooks/useMergeReviewData'
import { filterRows, buildIssueGroups } from '../review/UnifiedReviewView/helpers'
import { buildOrgPathMap } from '../review/components/BulkFieldEditModal/helpers'
import { DEFAULT_FILTER, type UnifiedFilter, type IssueGroupDef } from '../review/UnifiedReviewView/types'
import type { NavMode } from '../../store/reviewFilterStore'
import { FilterBar } from '../review/UnifiedReviewView/FilterBar'
import { MergeReviewTable } from './MergeReviewTable'
import { MergeReviewFooter } from './MergeReviewFooter'
import { groupRowsByOrg } from './helpers'
import { ConfirmDialog } from '../common/ConfirmDialog'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'

export function MergeReviewView({ onClose }: { onClose: () => void }) {
  const {
    pendingMerge, allocationList, afterOrganizations,
    updateMergeRowField, approveMergeRows, rejectMergeRows, returnMergeRows,
    releaseMergeSession, discardMergeSession,
  } = useStore(
    useShallow(s => ({
      pendingMerge:         s.pendingMerge,
      allocationList:       s.allocationList,
      afterOrganizations:   s.afterOrganizations,
      updateMergeRowField:  s.updateMergeRowField,
      approveMergeRows:     s.approveMergeRows,
      rejectMergeRows:      s.rejectMergeRows,
      returnMergeRows:      s.returnMergeRows,
      releaseMergeSession:  s.releaseMergeSession,
      discardMergeSession:  s.discardMergeSession,
    }))
  )

  const [filter, setFilter] = useState<UnifiedFilter>(DEFAULT_FILTER)
  const [searchInput, setSearchInput] = useState('')
  const [navMode, setNavMode] = useState<NavMode>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  const switchNavMode = useCallback((mode: NavMode) => {
    setNavMode(mode)
    const base = { changedOnly: false, issuesOnly: false, activePatterns: new Set<EditPattern>(), activeIssueKey: '' }
    setFilter(f => ({
      ...f,
      ...(mode === 'changes' ? { ...base, changedOnly: true }
        : mode === 'issues'  ? { ...base, issuesOnly: true }
        : base),
    }))
  }, [])

  // 「新しい方の新の組織」でグループ化する軸（afterOrganizations の externalCode）
  const orgPathMap  = useMemo(() => buildOrgPathMap(afterOrganizations), [afterOrganizations])
  const afterOrgByCode = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )
  // 表示対象は未承認の行のみ（committed/confirmed は実データ側 or 確認済みなのでレビュー対象外）
  const reviewableRows = useMemo(
    () => pendingMerge?.rows.filter(r => r.status === 'pending') ?? [],
    [pendingMerge],
  )
  const { rows, keyByRowId } = useMergeReviewData(reviewableRows)

  // タブ・チップの件数バッジ用の母集団: 検索・詳細条件のみ反映し、changedOnly/issuesOnly/
  // activePatterns/activeIssueKey（タブ自体・チップ自体の選択状態）では狭めない。
  // 選択中の他チップ・タブによってさらに件数が狭まるとミスリーディングになるため
  // （UnifiedReviewView/index.tsx と同じ方針。ここだけ filter をそのまま使っていたのが不整合の原因だった）。
  const rowsForCounts = useMemo(
    () => filterRows(rows, { ...DEFAULT_FILTER, searchText: filter.searchText, fieldConditions: filter.fieldConditions }, orgPathMap),
    [rows, filter.searchText, filter.fieldConditions, orgPathMap],
  )
  const patternCounts = useMemo(() => {
    const counts = new Map<EditPattern, number>()
    for (const r of rowsForCounts) for (const p of r.activePatterns) counts.set(p, (counts.get(p) ?? 0) + 1)
    return counts
  }, [rowsForCounts])
  const changedCount = useMemo(() => rowsForCounts.filter(r => r.changes.diffCount > 0).length, [rowsForCounts])
  const issueGroups  = useMemo(() => buildIssueGroups(rowsForCounts), [rowsForCounts])

  const filteredRows = useMemo(() => filterRows(rows, filter, orgPathMap), [rows, filter, orgPathMap])

  const sessionRowByKey = useMemo(
    () => new Map((pendingMerge?.rows ?? []).map(r => [r.key, r])),
    [pendingMerge],
  )
  const currentByNo = useMemo(
    () => new Map(allocationList.map(r => [r.no, r] as const)),
    [allocationList],
  )

  // filteredRows（新しい方の新の組織コード = row.departmentCode）を組織別にグループ化
  const groupedItems = useMemo(
    () => groupRowsByOrg(filteredRows, orgPathMap, afterOrgByCode),
    [filteredRows, orgPathMap, afterOrgByCode],
  )

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.row.rowId))
  const toggleSelectAllVisible = () => {
    setSelected(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const r of filteredRows) next.delete(r.row.rowId)
        return next
      }
      return new Set([...prev, ...filteredRows.map(r => r.row.rowId)])
    })
  }
  const toggleRow = (rowId: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }

  const selectedKeys = useMemo(
    () => [...selected].map(id => keyByRowId.get(id)).filter((k): k is string => !!k),
    [selected, keyByRowId],
  )

  // 選択した行を承認する（追加・変更は実データへ反映、消えた行は確認のみ）。1クリックで完結する。
  const handleApproveSelected = () => {
    approveMergeRows(selectedKeys)
    setSelected(new Set())
  }

  // 却下（取り込まない・再提出も求めない）。データ変更なし
  const handleRejectSelected = () => {
    rejectMergeRows(selectedKeys)
    setSelected(new Set())
  }

  // 差し戻し（担当者に再提出を依頼）。データ変更なし。履歴に担当者名（incomingRow.assignee）付きで残る
  const handleReturnSelected = () => {
    returnMergeRows(selectedKeys)
    setSelected(new Set())
  }

  // 残りの未承認行をまとめて承認する近道。個別に却下/差し戻ししたい行は
  // 先に選んでそちらのボタンを押してから使うこと。
  const handleApproveAll = () => {
    if (!pendingMerge) return
    const allPendingKeys = pendingMerge.rows.filter(r => r.status === 'pending').map(r => r.key)
    approveMergeRows(allPendingKeys)
    setSelected(new Set())
  }

  // 一括修正: 確定的な修正値（suggestedPatch）がある問題のみ対応。個別の判断が必要な
  // 問題は、常時表示している取り込み値の入力欄から直接編集する。
  const handleBulkFix = (group: IssueGroupDef) => {
    const patch = group.suggestedPatch
    if (!patch) return
    for (const rowId of group.rowIds) {
      const key = keyByRowId.get(rowId)
      if (!key) continue
      for (const [field, value] of Object.entries(patch)) {
        updateMergeRowField(key, field, String(value ?? ''))
      }
    }
  }

  const handleDownloadSession = () => {
    if (!pendingMerge) return
    const blob = new Blob([JSON.stringify(pendingMerge, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `merge-session-${pendingMerge.mode}-${pendingMerge.importedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusCounts = useMemo(() => {
    const counts = { total: 0, committed: 0, confirmed: 0, rejected: 0, returned: 0, pending: 0 }
    for (const r of pendingMerge?.rows ?? []) {
      counts.total += 1
      counts[r.status] += 1
    }
    return counts
  }, [pendingMerge])

  const remaining  = statusCounts.pending
  const canRelease = pendingMerge !== null && remaining === 0

  if (!pendingMerge) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: '96vw', maxWidth: '1600px', height: '90vh' }}>
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 flex items-center gap-3">
          <div>
            <div className="text-sm font-bold text-gray-800">
              {pendingMerge.mode === 'rebase' ? 'リベースレビュー' : 'マージレビュー'}
            </div>
            <div className="text-xs text-gray-500">
              {pendingMerge.sourceFileName}
              {!!pendingMerge.autoAppliedCount && ` ・ 自動反映済み ${pendingMerge.autoAppliedCount}件（差分なし）`}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
              <span>全{statusCounts.total}件中</span>
              <span className="text-emerald-700 font-medium">反映 {statusCounts.committed}</span>
              <span className="text-gray-300">・</span>
              <span className="text-gray-500">確認 {statusCounts.confirmed}</span>
              <span className="text-gray-300">・</span>
              <span className="text-gray-600">却下 {statusCounts.rejected}</span>
              <span className="text-gray-300">・</span>
              <span className="text-amber-700 font-medium">差し戻し {statusCounts.returned}</span>
              <span className="text-gray-300">・</span>
              <span className="text-red-600 font-semibold">残り {statusCounts.pending}</span>
            </div>
          </div>
          <button onClick={handleDownloadSession} className="ml-auto text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
            セッションをJSONで保存
          </button>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
            閉じる
          </button>
        </div>

        <div className="px-5 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700 flex-shrink-0">
          ⚠ この作業状態はブラウザ内にのみ保存されます。消えるリスクがあるため、閉じる前に「セッションをJSONで保存」を推奨します。
          承認した行はその場で実データに反映されます（Undoで戻せます）。まだ判断できない行はそのまま未処理で残せます。
        </div>

        {pendingMerge.masterMismatchWarning && (
          <div className="px-5 py-1.5 bg-red-50 border-b border-red-100 text-[11px] text-red-700 flex-shrink-0">
            ⚠ {pendingMerge.masterMismatchWarning}
          </div>
        )}

        <FilterBar
          filter={filter}
          onFilterChange={setFilter}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          patternCounts={patternCounts}
          issueGroups={issueGroups}
          filteredCount={filteredRows.length}
          totalRows={rowsForCounts.length}
          changedCount={changedCount}
          masters={useStore.getState().masters}
          onOpenBulkModal={handleBulkFix}
          navMode={navMode}
          switchNavMode={switchNavMode}
          showOldOrg={false}
          setShowOldOrg={() => {}}
        />

        <MergeReviewTable
          groupedItems={groupedItems}
          keyByRowId={keyByRowId}
          sessionRowByKey={sessionRowByKey}
          currentByNo={currentByNo}
          selected={selected}
          toggleRow={toggleRow}
          allVisibleSelected={allVisibleSelected}
          toggleSelectAllVisible={toggleSelectAllVisible}
          updateMergeRowField={updateMergeRowField}
        />

        <MergeReviewFooter
          selectedCount={selected.size}
          approvableCount={selectedKeys.length}
          remaining={remaining}
          canRelease={canRelease}
          onApproveSelected={handleApproveSelected}
          onRejectSelected={handleRejectSelected}
          onReturnSelected={handleReturnSelected}
          onApproveAll={handleApproveAll}
          onDiscard={() => setDiscardConfirmOpen(true)}
          onRelease={() => { releaseMergeSession(); onClose() }}
        />
      </div>

      {discardConfirmOpen && (
        <ConfirmDialog
          message={
            `このマージ/リベースのレビューを破棄し、開始時点の状態に完全に戻します。\n` +
            `承認・却下・差し戻し済みの行も含め、このセッション中に行った変更はすべて取り消されます。\n` +
            `（破棄そのものはUndoで取り消せます）\nよろしいですか？`
          }
          confirmLabel="破棄する"
          onConfirm={() => { discardMergeSession(); onClose() }}
          onCancel={() => setDiscardConfirmOpen(false)}
        />
      )}
    </div>
  )
}
