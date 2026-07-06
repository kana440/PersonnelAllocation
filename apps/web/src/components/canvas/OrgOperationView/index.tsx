import { useState, useCallback, useRef, useMemo } from 'react'
import { useStore }           from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { ComparisonSplitView }  from '../ComparisonSplitView'
import { SetPositionManagerOperation } from '@personnel/domain/commands/handlers/positionOps'
import { ReorderRowOperation }         from '@personnel/domain/commands/handlers/reorderRow'
import { bindOperation }               from '@personnel/domain/commands/defs'
import { orgRestructureDef }           from '@personnel/domain/commands/defs/orgTransferDefs'
import { moveToVacantPositionDef }     from '@personnel/domain/commands/defs/positionMoveDefs'
import { TR }                          from '@personnel/domain/transferReasonLabels'
import type { Organization }           from '@personnel/domain/schemas'
import { appService }          from '../../../application/HRApplicationService'
import { useScopedStore }      from '../../../store/useScopedStore'
import { SecondmentInAddModal }  from '../modals/SecondmentInAddModal'
import type { SecondmentInValues } from '../modals/SecondmentInAddModal'
import type { EditPattern }    from '@personnel/domain/patterns/editPattern'
import { CanvasModals }        from '../CanvasModals'
import { TreeWindowCanvas }    from '../TreeWindowCanvas'
import { CanvasQuickSearch }   from '../CanvasQuickSearch'
import { DisplayFieldCombobox } from '../toolbar/DisplayFieldCombobox'
import { OrgViewContext }      from '../OrgViewContext'
import type { OrgViewContextValue } from '../OrgViewContext'
import { useOrgDrag }          from '../hooks/useOrgDrag'
import { useDropIntent }       from '../hooks/useDropIntent'
import { useBulkMove }         from '../hooks/useBulkMove'
import { useOrgViewData }      from '../hooks/useOrgViewData'
import { usePersonSelection }  from './usePersonSelection'
import { PatternDialogs }      from './PatternDialogs'
import { FloatingAbsencePanel } from '../FloatingAbsencePanel'

export function OrgOperationView() {
  const store = useScopedStore()
  const {
    afterOrganizations: allAfterOrgsUnscoped,
    beforeOrganizations,
    orgMapping,
    isHistoryPreviewMode, historyPreviewPosition,
    previewAllocationList, previewPersons, previewAfterOrganizations,
    applyHistoryPreview, cancelHistoryPreview,
    undoHistory,
    masters,
  } = useStore()
  const comparisonMode = useCanvasLayoutStore(s => s.comparisonMode)
  const {
    afterOrganizations: scopedAfterOrgs, persons: scopedPersons,
    allocationList: scopedAllocList,
    selectPerson, selectCard, saveRow,
    operationPanelRowId, enterOperationPanel,
    assigneeWarnings,
  } = store

  // プレビューモード時は preview データを使って描画
  const allAfterOrgs   = (isHistoryPreviewMode && previewAfterOrganizations) ? previewAfterOrganizations : scopedAfterOrgs
  const persons        = (isHistoryPreviewMode && previewPersons)            ? previewPersons            : scopedPersons
  const allocationList = (isHistoryPreviewMode && previewAllocationList)     ? previewAllocationList     : scopedAllocList

  const organizations = useMemo(() => allAfterOrgs.filter(o => !o.isAbandoned), [allAfterOrgs])
  const orgById = useMemo(() => new Map(organizations.map(o => [o.id, o])), [organizations])
  const childrenByOrgId = useMemo(() => {
    const m = new Map<string, Organization[]>()
    for (const o of organizations) {
      if (!o.parentId) continue
      const arr = m.get(o.parentId)
      if (arr) arr.push(o)
      else m.set(o.parentId, [o])
    }
    return m
  }, [organizations])
  const { afterOrgByCode, afterMembersByOrgId, positionTreeByOrgId } = useOrgViewData({ allAfterOrgs, beforeOrganizations, persons, allocationList, masters, orgMapping })

  // orgId → サブツリー全体のアイテム数。O(N) で1回構築し全 TreeWindow が共有する
  const subtreeCountByOrgId = useMemo(() => {
    const map = new Map<string, number>()
    const compute = (orgId: string): number => {
      const cached = map.get(orgId)
      if (cached !== undefined) return cached
      let n = positionTreeByOrgId.get(orgId)?.length ?? 0
      for (const c of childrenByOrgId.get(orgId) ?? []) n += compute(c.id)
      map.set(orgId, n)
      return n
    }
    for (const org of organizations) compute(org.id)
    return map
  }, [positionTreeByOrgId, childrenByOrgId, organizations])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [confirmDialog,       setConfirmDialog]       = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [fieldPickerOpen,     setFieldPickerOpen]     = useState(false)
  const [moveModalOpen,       setMoveModalOpen]       = useState(false)
  const [bulkActionModal,     setBulkActionModal]     = useState<'transferReason' | 'manager' | 'secondment' | null>(null)
  const [secondmentInModal,   setSecondmentInModal]   = useState<{
    orgId: string; orgCode: string; sfIntegrated: boolean; concurrent: boolean
  } | null>(null)
  const [activePatternDialog,         setActivePatternDialog]         = useState<{ pattern: EditPattern; rowId: number } | null>(null)
  const [bandDropOpState,             setBandDropOpState]             = useState<import('../hooks/useDropIntent').DropOpState | null>(null)
  const [restoreVacantPositionOpen,   setRestoreVacantPositionOpen]   = useState(false)
  const [absencePanelVisible,         setAbsencePanelVisible]         = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const {
    selectedPersonIds, isSelectMode,
    handlePersonClick,
    addPersonsToSelection, clearSelection, exitSelectMode,
  } = usePersonSelection({ persons, allocationList, selectPerson, selectCard })

  const {
    dropIntentState, setDropIntentState, dropOpState, setDropOpState,
    handleIntentPick, handleImmediateTransfer, handleBatchTransfer,
  } = useDropIntent()

  const handleUnmappedBulkDrop = useCallback((rowIds: number[], toOrg: Organization) => {
    const targetCode = toOrg.externalCode ?? toOrg.id
    const commands = rowIds.map(rowId =>
      bindOperation(orgRestructureDef, rowId, {
        departmentCode: targetCode,
        transferReason: TR.DIV_TRANSFER_RESTRUCTURE,
      })
    )
    appService.executeBatch(`組改一括: → ${toOrg.name}`, commands)
  }, [])

  const {
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    dropPersonRowId, setDropPersonRowId,
    dropGapBelowRowId, setDropGapBelowRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    clearAllDropTargets,
  } = useOrgDrag({
    organizations, saveRow,
    openPersonMoveDialog: (fromRowId, personId, toOrgId) =>
      setDropIntentState({ fromRowId, personId, toOrgId, dropType: 'org' }),
    onUnmappedBulkDrop: handleUnmappedBulkDrop,
    onVacantDrop: isHistoryPreviewMode ? undefined : (personRowId, vacantRowId) => {
      const personRow = allocationList.find(r => r.rowId === personRowId)
      const vacantRow = allocationList.find(r => r.rowId === vacantRowId)
      if (!personRow || !vacantRow) return
      const vacantPosCode = vacantRow.positionCode as string | undefined
      if (!vacantPosCode) return
      setBandDropOpState({
        def:             moveToVacantPositionDef,
        row:             personRow,
        overrideInitial: { _targetPositionCode: vacantPosCode },
      })
    },
    onAbsenceReturn: (fromRowId, toOrg) => {
      const targetCode = toOrg.externalCode ?? toOrg.id
      saveRow(fromRowId, { departmentCode: targetCode, transferReason: undefined })
    },
  })

  const { bulkMoveSourceId, setBulkMoveSourceId, handleBulkMoveConfirm } = useBulkMove({
    allocationList, afterOrgByCode, allAfterOrgsUnscoped,
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePersonDoubleClick = (personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const firstRow = allocationList.find(r => r.userId === person.sfPersonId)
    if (!firstRow) return
    enterOperationPanel(firstRow.rowId, 'directEdit')
  }

  const handleRowDoubleClick = useCallback((e: React.MouseEvent, rowId: number) => {
    e.preventDefault(); e.stopPropagation()
    if (isHistoryPreviewMode) return
    if (operationPanelRowId !== null && operationPanelRowId !== rowId) {
      setConfirmDialog({
        message: '別の行の操作パネルが開いています。切り替えますか？（変更は保持されます）',
        onConfirm: () => enterOperationPanel(rowId),
      })
      return
    }
    enterOperationPanel(rowId)
  }, [isHistoryPreviewMode, operationPanelRowId, enterOperationPanel])

  const handleDropPositionOnPosition = (e: React.DragEvent, targetRowId: number) => {
    e.preventDefault(); e.stopPropagation()
    let data: { dragType?: string; fromRowId?: number }
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as typeof data } catch { return }
    if (data.dragType !== 'position' || !data.fromRowId || data.fromRowId === targetRowId) return
    const sourceRow = allocationList.find(r => r.rowId === data.fromRowId)
    const targetRow = allocationList.find(r => r.rowId === targetRowId)
    if (!sourceRow?.positionCode || !targetRow?.positionCode) return
    // 循環上司チェック
    const mgrCodeByPosCode = new Map(allocationList.filter(r => r.positionCode).map(r => [r.positionCode!, r.managerPositionCode]))
    let cur: string | undefined = targetRow.managerPositionCode
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === sourceRow.positionCode) return
      seen.add(cur); cur = mgrCodeByPosCode.get(cur)
    }
    appService.executeOperation(new SetPositionManagerOperation(data.fromRowId, targetRow.positionCode))
  }

  const handleReorderRow = (rowId: number, beforeRowId: number | null) => {
    if (isHistoryPreviewMode) return
    appService.executeOperation(new ReorderRowOperation(rowId, beforeRowId))
  }

  const topPositionCodeOfOrg = (orgId: string): string | undefined => {
    const rows   = allocationList.filter(r => afterOrgByCode.get(r.departmentCode ?? '')?.id === orgId && !!r.positionCode)
    const posSet = new Set(rows.map(r => r.positionCode).filter(Boolean))
    return rows.find(r => !r.managerPositionCode || !posSet.has(r.managerPositionCode))?.positionCode
  }

  const handleSecondmentIn = (orgId: string, orgCode: string, sfIntegrated: boolean, concurrent: boolean) => {
    setSecondmentInModal({ orgId, orgCode, sfIntegrated, concurrent })
  }

  const handleSecondmentInConfirm = (values: SecondmentInValues) => {
    if (!secondmentInModal) return
    appService.createSecondmentInRow(secondmentInModal.orgCode, values)
    setSecondmentInModal(null)
  }

  const handleAddPosition = (orgId: string, orgCode: string) => {
    const { allocationList: current } = appService.getSnapshot()
    const newRowId = current.length === 0 ? 1 : Math.max(...current.map(r => r.rowId)) + 1
    const topMgrCode = topPositionCodeOfOrg(orgId)
    appService.createVacantPosition(orgCode, '', topMgrCode ? { managerPositionCode: topMgrCode } : undefined)
    enterOperationPanel(newRowId, 'directEdit')
  }

  const previewLabel = historyPreviewPosition !== null
    ? (undoHistory.find(e => e.index === historyPreviewPosition)?.label ?? '') : ''

  // ── Context value ─────────────────────────────────────────────────────────
  // selectedCardRowId は除外: クリックのたびに全 RowCard が Context 経由で再レンダーされるのを防ぐ。
  // RowCard は useStore(s => s.selectedCardRowId === row.rowId) で直接購読する。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctxValue: OrgViewContextValue = useMemo(() => ({
    organizations, orgById, childrenByOrgId, positionTreeByOrgId, afterMembersByOrgId, subtreeCountByOrgId,
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    dropPersonRowId, setDropPersonRowId,
    dropGapBelowRowId, setDropGapBelowRowId,
    openDropIntent:  isHistoryPreviewMode ? () => {} : (s: import('../hooks/useDropIntent').DropIntentState) => {
      if (s.fromAbsence && s.fromRowId) {
        const toOrg = organizations.find(o => o.id === s.toOrgId)
        if (toOrg) saveRow(s.fromRowId, { departmentCode: toOrg.externalCode ?? toOrg.id, transferReason: undefined })
        return
      }
      setDropIntentState(s)
    },
    openBandDrop:       isHistoryPreviewMode ? () => {} : (s: import('../hooks/useDropIntent').DropOpState) => setBandDropOpState(s),
    openGroupFormDrop:  isHistoryPreviewMode ? () => {} : (s: import('../hooks/useDropIntent').DropOpState) => setDropOpState(s),
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    handleAddPosition:  isHistoryPreviewMode ? () => {} : handleAddPosition,
    handleSecondmentIn: isHistoryPreviewMode ? () => {} : handleSecondmentIn,
    topPositionCodeOfOrg,
    setBulkMoveSourceId: isHistoryPreviewMode ? () => {} : setBulkMoveSourceId,
    setConfirmDialog:    isHistoryPreviewMode ? () => {} : setConfirmDialog,
    isSelectMode, selectedPersonIds,
    handlePersonClick, addPersonsToSelection, clearSelection,
    selectCard,
    isHistoryPreviewMode,
    handlePersonDoubleClick, handleRowDoubleClick,
    handleDropPositionOnPosition, handleReorderRow,
    expandedChipIds: new Set(),
    toggleChip: () => {},
  // deps: selectedCardRowId は意図的に除外（RowCard は store 直接購読に移行済み）
  }), [
    organizations, orgById, childrenByOrgId, positionTreeByOrgId, afterMembersByOrgId, subtreeCountByOrgId,
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    dropPersonRowId, setDropPersonRowId,
    dropGapBelowRowId, setDropGapBelowRowId,
    isHistoryPreviewMode, saveRow, setDropIntentState, setBandDropOpState, setDropOpState,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    handleAddPosition, handleSecondmentIn, topPositionCodeOfOrg,
    setBulkMoveSourceId, setConfirmDialog,
    isSelectMode, selectedPersonIds,
    handlePersonClick, addPersonsToSelection, clearSelection,
    selectCard, handlePersonDoubleClick, handleRowDoubleClick,
    handleDropPositionOnPosition, handleReorderRow,
  ])

  return (
    <OrgViewContext.Provider value={ctxValue}>
      <div className="flex flex-col h-full overflow-hidden" onDragEnd={clearAllDropTargets}>

        <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2">
          {comparisonMode && (
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex-shrink-0">比較モード</span>
          )}
          {!isHistoryPreviewMode && <CanvasQuickSearch />}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <DisplayFieldCombobox />

            {!comparisonMode && !isHistoryPreviewMode && (
              <button
                onClick={() => setRestoreVacantPositionOpen(true)}
                className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                title="旧にあって新に存在しないポジションを空席として追加"
              >
                未使用Pos追加
              </button>
            )}

            {!comparisonMode && !isHistoryPreviewMode && (
              <button
                onClick={() => setAbsencePanelVisible(v => !v)}
                className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                  absencePanelVisible
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
                title="退職・移籍など4/1時点で不在になる方を管理"
              >
                4/1不在
              </button>
            )}

          </div>
        </div>

        {isHistoryPreviewMode && (
          <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <span className="text-[11px] text-amber-700 flex-1 font-medium truncate">
              🔍 プレビュー（読み取り専用）{previewLabel ? ` — ${previewLabel}` : ''}
            </span>
            <button onClick={applyHistoryPreview} className="flex-shrink-0 px-2.5 py-0.5 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors">この状態に戻す</button>
            <button onClick={cancelHistoryPreview} className="flex-shrink-0 px-2.5 py-0.5 text-[10px] rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">閉じる</button>
          </div>
        )}

        {assigneeWarnings?.hasWarnings && (
          <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap">
            {assigneeWarnings.otherAssigneeCount > 0 && (
              <span className="text-[11px] text-amber-700">⚠ {assigneeWarnings.otherAssigneeCount}行に別の担当者が設定されています（参照のみ）</span>
            )}
            {assigneeWarnings.unassignedCount > 0 && (
              <span className="text-[11px] text-amber-700">⚠ {assigneeWarnings.unassignedCount}行に担当者が設定されていません</span>
            )}
          </div>
        )}

        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden"
          onDragOverCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
          onDragEnterCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
        >
          {comparisonMode ? <ComparisonSplitView /> : <TreeWindowCanvas />}
        </div>

        <PatternDialogs
          activePatternDialog={activePatternDialog}
          onClose={() => setActivePatternDialog(null)}
        />

        {secondmentInModal && (() => {
          const org = organizations.find(o => o.externalCode === secondmentInModal.orgCode || o.id === secondmentInModal.orgCode)
          return (
            <SecondmentInAddModal
              orgCode={secondmentInModal.orgCode}
              orgName={org?.name ?? secondmentInModal.orgCode}
              sfIntegrated={secondmentInModal.sfIntegrated}
              concurrent={secondmentInModal.concurrent}
              onConfirm={handleSecondmentInConfirm}
              onClose={() => setSecondmentInModal(null)}
            />
          )
        })()}

        <CanvasModals
          isSelectMode={isSelectMode}
          selectedPersonIds={selectedPersonIds}
          exitSelectMode={exitSelectMode}
          moveModalOpen={moveModalOpen}
          setMoveModalOpen={setMoveModalOpen}
          bulkActionModal={bulkActionModal}
          setBulkActionModal={setBulkActionModal}
          bulkMoveSourceId={bulkMoveSourceId}
          setBulkMoveSourceId={setBulkMoveSourceId}
          dropIntentState={dropIntentState}
          setDropIntentState={setDropIntentState}
          dropOpState={dropOpState}
          setDropOpState={setDropOpState}
          bandDropOpState={bandDropOpState}
          setBandDropOpState={setBandDropOpState}
          confirmDialog={confirmDialog}
          setConfirmDialog={setConfirmDialog}
          fieldPickerOpen={fieldPickerOpen}
          setFieldPickerOpen={setFieldPickerOpen}
          restoreVacantPositionOpen={restoreVacantPositionOpen}
          setRestoreVacantPositionOpen={setRestoreVacantPositionOpen}
          persons={persons}
          allocationList={allocationList}
          allAfterOrgsUnscoped={allAfterOrgsUnscoped}
          positionTreeByOrgId={positionTreeByOrgId}
          afterMembersByOrgId={afterMembersByOrgId}
          handleBulkMoveConfirm={handleBulkMoveConfirm}
          handleIntentPick={handleIntentPick}
          handleImmediateTransfer={handleImmediateTransfer}
          handleBatchTransfer={handleBatchTransfer}
        />
      </div>

      <FloatingAbsencePanel
        allocationList={allocationList}
        orgsByCode={afterOrgByCode}
        visible={absencePanelVisible}
        containerRef={canvasRef}
        onCardDoubleClick={enterOperationPanel}
      />
    </OrgViewContext.Provider>
  )
}
