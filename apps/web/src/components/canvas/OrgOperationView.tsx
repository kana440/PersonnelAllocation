import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { useChatStore } from '../../store/useChatStore'
import { ComparisonSplitView } from './ComparisonSplitView'
import { SetPositionManagerOperation } from '@personnel/domain/commands/handlers/positionOps'
import { ReorderRowOperation }         from '@personnel/domain/commands/handlers/reorderRow'
import { appService } from '../../application/HRApplicationService'
import { useScopedStore } from '../../store/useScopedStore'
import { OrgTransferDialog }       from './patternDialogs/OrgTransferDialog'
import { PromotionDialog }         from './patternDialogs/PromotionDialog'
import { JobTypeDialog }           from './patternDialogs/JobTypeDialog'
import { ResignationDialog }       from './patternDialogs/ResignationDialog'
import { VacantPositionDialog }    from './patternDialogs/VacantPositionDialog'
import { SecondmentReleaseDialog } from './patternDialogs/SecondmentReleaseDialog'
import { SecondmentInAddModal }    from './SecondmentInAddModal'
import type { SecondmentInValues } from './SecondmentInAddModal'
import type { EditPattern }   from '@personnel/domain/patterns/editPattern'
import { CanvasModals }     from './CanvasModals'
import { TreeWindowCanvas }       from './TreeWindowCanvas'
import { DisplayFieldCombobox }   from './components/DisplayFieldCombobox'
import { OrgViewContext }   from './OrgViewContext'
import type { OrgViewContextValue } from './OrgViewContext'
import { useOrgDrag }       from './hooks/useOrgDrag'
import { usePersonMove }    from './hooks/usePersonMove'
import { useBulkMove }      from './hooks/useBulkMove'
import { useOrgViewData }   from './hooks/useOrgViewData'

export function OrgOperationView() {
  const store = useScopedStore()
  const {
    afterOrganizations: allAfterOrgsUnscoped,
    isHistoryPreviewMode, historyPreviewPosition,
    previewAllocationList, previewPersons, previewAfterOrganizations,
    applyHistoryPreview, cancelHistoryPreview,
    undoHistory,
  } = useStore()
  const {
    comparisonMode, toggleComparisonMode,
  } = useCanvasLayoutStore()
  const {
    afterOrganizations: scopedAfterOrgs, persons: scopedPersons,
    allocationList: scopedAllocList,
    selectedPersonId, selectPerson, enterEditMode, saveRow,
    operationPanelRowId, enterOperationPanel,
    assignPersonToVacantPosition,
    assigneeWarnings,
  } = store

  // プレビューモード時は preview データを使って描画
  const allAfterOrgs   = (isHistoryPreviewMode && previewAfterOrganizations) ? previewAfterOrganizations : scopedAfterOrgs
  const persons        = (isHistoryPreviewMode && previewPersons)            ? previewPersons            : scopedPersons
  const allocationList = (isHistoryPreviewMode && previewAllocationList)     ? previewAllocationList     : scopedAllocList

  const organizations = allAfterOrgs.filter(o => !o.isAbandoned)

  const { afterOrgByCode, afterMembersByOrgId, positionTreeByOrgId } = useOrgViewData({
    allAfterOrgs, persons, allocationList,
  })

  // ── UI state ───────────────────────────────────────────────────
  const [confirmDialog,      setConfirmDialog]      = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [fieldPickerOpen,    setFieldPickerOpen]    = useState(false)
  const [selectedPersonIds,  setSelectedPersonIds]  = useState<Set<string>>(new Set())
  const [moveModalOpen,      setMoveModalOpen]      = useState(false)
  const [bulkActionModal,    setBulkActionModal]    = useState<'transferReason' | 'manager' | 'secondment' | null>(null)
  const [changeTitleRowId,   setChangeTitleRowId]   = useState<number | null>(null)
  const [secondmentInModal,  setSecondmentInModal]  = useState<{
    orgId: string; orgCode: string; sfIntegrated: boolean; concurrent: boolean
  } | null>(null)
  const [activePatternDialog, setActivePatternDialog] = useState<{ pattern: EditPattern; rowId: number } | null>(null)

  const isSelectMode = selectedPersonIds.size > 0
  const lastClickRef        = useRef<{ personId: string; panelId: string } | null>(null)
  const selectedPersonIdRef = useRef(selectedPersonId)
  selectedPersonIdRef.current = selectedPersonId

  // ── Hooks ──────────────────────────────────────────────────────
  const handleSelectPerson = useCallback((personId: string) => {
    selectPerson(personId)
    const p = persons.find(q => q.id === personId)
    if (p?.sfPersonId) {
      const rows = allocationList.filter(r => r.userId === p.sfPersonId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (primary) useChatStore.getState().setChatContext([primary.rowId])
    }
  }, [selectPerson, persons, allocationList])

  const { personMoveDialog, setPersonMoveDialog, handlePersonMoveConfirm } = usePersonMove({
    persons, allocationList,
  })

  const {
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
  } = useOrgDrag({
    organizations, persons, saveRow, assignPersonToVacantPosition,
    openPersonMoveDialog: (fromRowId, personId, toOrgId) => setPersonMoveDialog({ fromRowId, personId, toOrgId }),
  })

  const { bulkMoveSourceId, setBulkMoveSourceId, handleBulkMoveConfirm } = useBulkMove({
    allocationList, afterOrgByCode, allAfterOrgsUnscoped,
  })

  // ── Helpers ────────────────────────────────────────────────────
  const handlePersonDoubleClick = (personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const firstRow = allocationList.find(r => r.userId === person.sfPersonId)
    if (!firstRow) return
    enterEditMode(firstRow.rowId)
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

    const mgrCodeByPosCode = new Map(
      allocationList.filter(r => r.positionCode).map(r => [r.positionCode!, r.managerPositionCode])
    )
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

  const clearSelection = useCallback(() => {
    setSelectedPersonIds(new Set())
    useStore.setState({ selectedPersonId: null })
  }, [])

  const exitSelectMode = clearSelection

  const addPersonsToSelection = useCallback((ids: Set<string>) => {
    setSelectedPersonIds(prev => new Set([...prev, ...ids]))
  }, [])

  const handlePersonClick = useCallback((
    personId: string, panelId: string,
    { ctrl, shift }: { ctrl: boolean; shift: boolean },
  ) => {
    if (ctrl) {
      setSelectedPersonIds(prev => {
        const next = new Set(prev)
        // 初回 Ctrl+クリック時: 単体選択中の人も引き継ぐ
        if (prev.size === 0 && selectedPersonIdRef.current) {
          next.add(selectedPersonIdRef.current)
        }
        next.has(personId) ? next.delete(personId) : next.add(personId)
        return next
      })
      lastClickRef.current = { personId, panelId }
    } else if (shift) {
      const last     = lastClickRef.current
      const panelEl  = document.querySelector(`[data-panelid="${panelId}"]`)
      if (panelEl && last?.panelId === panelId) {
        const pids = [...panelEl.querySelectorAll<HTMLElement>('[data-personid]:not([data-personid=""])')]
          .map(el => el.getAttribute('data-personid')!)
        const a = pids.indexOf(last.personId)
        const b = pids.indexOf(personId)
        if (a !== -1 && b !== -1) {
          setSelectedPersonIds(prev => new Set([...prev, ...pids.slice(Math.min(a, b), Math.max(a, b) + 1)]))
        } else {
          setSelectedPersonIds(prev => new Set([...prev, personId]))
        }
      } else {
        setSelectedPersonIds(prev => new Set([...prev, personId]))
        lastClickRef.current = { personId, panelId }
      }
    } else {
      setSelectedPersonIds(new Set())
      handleSelectPerson(personId)
      lastClickRef.current = { personId, panelId }
    }
  }, [handleSelectPerson])

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
    enterEditMode(newRowId)
  }

  // 複数選択時にAIチャットコンテキストを連動
  useEffect(() => {
    if (selectedPersonIds.size === 0) return
    const rowIds = [...selectedPersonIds].flatMap(personId => {
      const p = persons.find(q => q.id === personId)
      if (!p?.sfPersonId) return []
      const rows = allocationList.filter(r => r.userId === p.sfPersonId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      return primary ? [primary.rowId] : []
    })
    if (rowIds.length > 0) useChatStore.getState().setChatContext(rowIds)
  }, [selectedPersonIds, persons, allocationList])

  const previewLabel = historyPreviewPosition !== null
    ? (undoHistory.find(e => e.index === historyPreviewPosition)?.label ?? '')
    : ''

  const ctxValue: OrgViewContextValue = {
    organizations, positionTreeByOrgId, afterMembersByOrgId,
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    handleAddPosition:    isHistoryPreviewMode ? () => {} : handleAddPosition,
    handleSecondmentIn:   isHistoryPreviewMode ? () => {} : handleSecondmentIn,
    topPositionCodeOfOrg,
    setBulkMoveSourceId:  isHistoryPreviewMode ? () => {} : setBulkMoveSourceId,
    setConfirmDialog:     isHistoryPreviewMode ? () => {} : setConfirmDialog,
    isSelectMode, selectedPersonIds,
    handlePersonClick, addPersonsToSelection, clearSelection,
    selectedPersonId, selectPerson: handleSelectPerson,
    isHistoryPreviewMode,
    handlePersonDoubleClick, handleRowDoubleClick,
    handleDropPositionOnPosition, handleReorderRow,
    expandedChipIds: new Set(),
    toggleChip:      () => {},
  }

  return (
    <OrgViewContext.Provider value={ctxValue}>
      <div className="flex flex-col h-full overflow-hidden" onDragEnd={() => setDragOverOrgId(null)}>

        {/* Header */}
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2">
          {comparisonMode && (
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex-shrink-0">比較モード</span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!comparisonMode && <DisplayFieldCombobox />}
            <button
              onClick={toggleComparisonMode}
              className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                comparisonMode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              title="旧→新の変化を組織パネルで比較表示"
            >{comparisonMode ? '比較終了' : '比較'}</button>
          </div>
        </div>

        {/* Preview banner */}
        {isHistoryPreviewMode && (
          <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <span className="text-[11px] text-amber-700 flex-1 font-medium truncate">
              🔍 プレビュー（読み取り専用）{previewLabel ? ` — ${previewLabel}` : ''}
            </span>
            <button
              onClick={applyHistoryPreview}
              className="flex-shrink-0 px-2.5 py-0.5 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors"
            >この状態に戻す</button>
            <button
              onClick={cancelHistoryPreview}
              className="flex-shrink-0 px-2.5 py-0.5 text-[10px] rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >閉じる</button>
          </div>
        )}

        {/* Assignee mode warning banner */}
        {assigneeWarnings?.hasWarnings && (
          <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap">
            {assigneeWarnings.otherAssigneeCount > 0 && (
              <span className="text-[11px] text-amber-700">
                ⚠ {assigneeWarnings.otherAssigneeCount}行に別の担当者が設定されています（参照のみ）
              </span>
            )}
            {assigneeWarnings.unassignedCount > 0 && (
              <span className="text-[11px] text-amber-700">
                ⚠ {assigneeWarnings.unassignedCount}行に担当者が設定されていません
              </span>
            )}
          </div>
        )}

        {/* Canvas */}
        <div
          className="flex-1 overflow-hidden"
          onDragOverCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
          onDragEnterCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
        >
          {comparisonMode ? (
            <ComparisonSplitView />
          ) : (
            <TreeWindowCanvas />
          )}
        </div>

        {activePatternDialog?.pattern === 'orgTransfer' && (
          <OrgTransferDialog       rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}
        {(activePatternDialog?.pattern === 'promotion' || activePatternDialog?.pattern === 'demotion') && (
          <PromotionDialog         rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}
        {activePatternDialog?.pattern === 'jobTypeChange' && (
          <JobTypeDialog           rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}
        {activePatternDialog?.pattern === 'resignation' && (
          <ResignationDialog       rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}
        {activePatternDialog?.pattern === 'vacantPositionMove' && (
          <VacantPositionDialog    rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}
        {(activePatternDialog?.pattern === 'secondmentOutRelease' ||
          activePatternDialog?.pattern === 'secondmentInRelease') && (
          <SecondmentReleaseDialog rowId={activePatternDialog.rowId} onClose={() => setActivePatternDialog(null)} />
        )}


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
          personMoveDialog={personMoveDialog}
          setPersonMoveDialog={setPersonMoveDialog}
          confirmDialog={confirmDialog}
          setConfirmDialog={setConfirmDialog}
          fieldPickerOpen={fieldPickerOpen}
          setFieldPickerOpen={setFieldPickerOpen}
          changeTitleRowId={changeTitleRowId}
          setChangeTitleRowId={setChangeTitleRowId}
          persons={persons}
          allocationList={allocationList}
          allAfterOrgsUnscoped={allAfterOrgsUnscoped}
          positionTreeByOrgId={positionTreeByOrgId}
          afterMembersByOrgId={afterMembersByOrgId}
          handleBulkMoveConfirm={handleBulkMoveConfirm}
          handlePersonMoveConfirm={handlePersonMoveConfirm}
        />

      </div>
    </OrgViewContext.Provider>
  )
}
