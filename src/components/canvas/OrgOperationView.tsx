import { useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { SetPositionManagerOperation } from '../../domain/operation/handlers/positionOps'
import { ReorderRowOperation }         from '../../domain/operation/handlers/reorderRow'
import { appService } from '../../application/HRApplicationService'
import { useScopedStore } from '../../store/useScopedStore'
import { ReportLineView }   from './components/ReportLineView'
import { OrgBox, DropZone } from './components/OrgBox'
import { PersonContextMenu, PositionContextMenu } from './CanvasContextMenus'
import { CanvasModals }     from './CanvasModals'
import { PositionRows }     from './components/PositionRows'
import { OrgViewContext }   from './OrgViewContext'
import type { OrgViewContextValue } from './OrgViewContext'
import { useOrgDrag }       from './hooks/useOrgDrag'
import { usePersonMove }    from './hooks/usePersonMove'
import { useBulkMove }      from './hooks/useBulkMove'
import { useOrgViewData }   from './hooks/useOrgViewData'
import { useReportLine }    from './hooks/useReportLine'

type CanvasMode = '組織図' | 'レポートライン'

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
    focusedOrgId, focusOrg,
    afterOrganizations: scopedAfterOrgs, persons: scopedPersons,
    allocationList: scopedAllocList,
    selectedPersonId, selectPerson, enterEditMode, saveRow,
    mainCanvasMode, setMainCanvasMode,
    expandedChipIds, toggleChip,
    assignPersonToVacantPosition,
    assigneeWarnings,
  } = store

  // プレビューモード時は preview データを使って描画
  const allAfterOrgs   = (isHistoryPreviewMode && previewAfterOrganizations) ? previewAfterOrganizations : scopedAfterOrgs
  const persons        = (isHistoryPreviewMode && previewPersons)            ? previewPersons            : scopedPersons
  const allocationList = (isHistoryPreviewMode && previewAllocationList)     ? previewAllocationList     : scopedAllocList

  const canvasMode    = mainCanvasMode
  const setCanvasMode = (mode: CanvasMode) => setMainCanvasMode(mode)
  const organizations = allAfterOrgs.filter(o => !o.isAbandoned)

  const { afterOrgByCode, personBySfId, afterMembersByOrgId, positionTreeByOrgId, positionContext } = useOrgViewData({
    allAfterOrgs, persons, allocationList,
  })

  const {
    expandedNodes, setExpandedNodes,
    reportLineRootId, setReportLineRootId,
    isReportLineInternalSelect,
    rlRootManagerId, rlRootPersonInfo,
  } = useReportLine({ allocationList, personBySfId, afterOrgByCode, canvasMode, selectedPersonId })

  // ── UI state ───────────────────────────────────────────────────
  const [contextMenu,         setContextMenu]         = useState<{ x: number; y: number; personId: string } | null>(null)
  const [positionContextMenu, setPositionContextMenu] = useState<{ x: number; y: number; rowId: number } | null>(null)
  const [confirmDialog,       setConfirmDialog]       = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [fieldPickerOpen,     setFieldPickerOpen]     = useState(false)
  const [isSelectMode,        setIsSelectMode]        = useState(false)
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set())
  const [moveModalOpen,     setMoveModalOpen]     = useState(false)
  const [bulkActionModal,   setBulkActionModal]   = useState<'transferReason' | 'manager' | 'secondment' | null>(null)
  const [changeTitleRowId,  setChangeTitleRowId]  = useState<number | null>(null)

  // ── Hooks ──────────────────────────────────────────────────────
  // selectPerson をラップしてチャットコンテキストも更新（案1: クリックで全クリア→1件）
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

  const handlePersonContextMenu = (e: React.MouseEvent, personId: string) => {
    e.preventDefault(); e.stopPropagation()
    selectPerson(personId)
    setContextMenu({ x: e.clientX, y: e.clientY, personId })
  }

  const handlePositionContextMenu = (e: React.MouseEvent, rowId: number) => {
    e.preventDefault(); e.stopPropagation()
    setPositionContextMenu({ x: e.clientX, y: e.clientY, rowId })
  }

  const handleDropPositionOnPosition = (e: React.DragEvent, targetRowId: number) => {
    e.preventDefault(); e.stopPropagation()
    let data: { dragType?: string; fromRowId?: number }
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as typeof data } catch { return }
    if (data.dragType !== 'position' || !data.fromRowId || data.fromRowId === targetRowId) return

    const sourceRow = allocationList.find(r => r.rowId === data.fromRowId)
    const targetRow = allocationList.find(r => r.rowId === targetRowId)
    if (!sourceRow?.positionCode || !targetRow?.positionCode) return

    // 循環チェック: target が source の子孫なら設定しない
    const mgrCodeByPosCode = new Map(
      allocationList.filter(r => r.positionCode).map(r => [r.positionCode!, r.managerPositionCode])
    )
    let cur: string | undefined = targetRow.managerPositionCode
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === sourceRow.positionCode) return  // cycle
      seen.add(cur); cur = mgrCodeByPosCode.get(cur)
    }

    appService.executeOperation(new SetPositionManagerOperation(data.fromRowId, targetRow.positionCode))
  }

  const handleReorderRow = (rowId: number, beforeRowId: number | null) => {
    if (isHistoryPreviewMode) return
    appService.executeOperation(new ReorderRowOperation(rowId, beforeRowId))
  }

  const togglePersonSelection = (personId: string) => setSelectedPersonIds(prev => {
    const next = new Set(prev); next.has(personId) ? next.delete(personId) : next.add(personId); return next
  })

  const exitSelectMode = () => { setIsSelectMode(false); setSelectedPersonIds(new Set()) }

  const topPositionCodeOfOrg = (orgId: string): string | undefined => {
    const rows   = allocationList.filter(r => afterOrgByCode.get(r.departmentCode ?? '')?.id === orgId && !!r.positionCode)
    const posSet = new Set(rows.map(r => r.positionCode).filter(Boolean))
    return rows.find(r => !r.managerPositionCode || !posSet.has(r.managerPositionCode))?.positionCode
  }

  const handleAddPosition = (orgId: string, orgCode: string) => {
    const { allocationList: current } = appService.getSnapshot()
    const newRowId = current.length === 0 ? 1 : Math.max(...current.map(r => r.rowId)) + 1
    const topMgrCode = topPositionCodeOfOrg(orgId)
    appService.createVacantPosition(orgCode, '', topMgrCode ? { managerPositionCode: topMgrCode } : undefined)
    enterEditMode(newRowId)
  }

  // ── Early returns ──────────────────────────────────────────────
  if (!focusedOrgId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左の組織ツリーから組織を選択してください
      </div>
    )
  }

  const focusedOrg = organizations.find(o => o.id === focusedOrgId)
  if (!focusedOrg) return null

  const buildBreadcrumb = (orgId: string): Array<{ id: string; name: string }> => {
    const path: Array<{ id: string; name: string }> = []
    let current = organizations.find(o => o.id === orgId)
    while (current) {
      path.unshift({ id: current.id, name: current.name })
      current = current.parentId ? organizations.find(o => o.id === current!.parentId) : undefined
    }
    return path
  }

  const breadcrumb = buildBreadcrumb(focusedOrgId)
  const parentOrg  = focusedOrg.parentId ? organizations.find(o => o.id === focusedOrg.parentId) : null
  const childOrgs  = organizations.filter(o => o.parentId === focusedOrgId)

  const previewLabel = historyPreviewPosition !== null
    ? (undoHistory.find(e => e.index === historyPreviewPosition)?.label ?? '')
    : ''

  const ctxValue: OrgViewContextValue = {
    organizations, positionContext, positionTreeByOrgId, afterMembersByOrgId,
    dragOverOrgId, setDragOverOrgId, highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    handleAddPosition:    isHistoryPreviewMode ? () => {} : handleAddPosition,
    topPositionCodeOfOrg,
    setBulkMoveSourceId:  isHistoryPreviewMode ? () => {} : setBulkMoveSourceId,
    setConfirmDialog:     isHistoryPreviewMode ? () => {} : setConfirmDialog,
    isSelectMode, selectedPersonIds, togglePersonSelection,
    selectedPersonId, selectPerson: handleSelectPerson,
    isHistoryPreviewMode,
    handlePersonDoubleClick, handlePersonContextMenu,
    handlePositionContextMenu, handleDropPositionOnPosition, handleReorderRow,
    expandedChipIds, toggleChip,
  }

  return (
    <OrgViewContext.Provider value={ctxValue}>
      <div className="flex flex-col h-full overflow-hidden" onDragEnd={() => setDragOverOrgId(null)}>

        {/* Header */}
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
          {canvasMode === 'レポートライン' ? (
            <>
              <button
                onClick={() => { if (rlRootManagerId) setReportLineRootId(rlRootManagerId) }}
                className={`text-xs flex-shrink-0 ${rlRootManagerId ? 'text-gray-500 hover:text-blue-600' : 'text-gray-300 cursor-default'}`}
              >↑ 上へ</button>
              <span className="text-gray-300 flex-shrink-0">|</span>
              <div className="text-xs flex-1 min-w-0 truncate text-gray-700">
                {rlRootPersonInfo
                  ? `${rlRootPersonInfo.name}${rlRootPersonInfo.orgName ? ` (${rlRootPersonInfo.orgName})` : ''}`
                  : <span className="text-gray-400">全体</span>
                }
              </div>
              {reportLineRootId && (
                <button onClick={() => setReportLineRootId(null)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">全体</button>
              )}
            </>
          ) : (
            <>
              {parentOrg && (
                <>
                  <button onClick={() => focusOrg(parentOrg.id)} className="text-xs text-gray-500 hover:text-blue-600 flex-shrink-0">← 上へ</button>
                  <span className="text-gray-300 flex-shrink-0">|</span>
                </>
              )}
              <div className="flex items-center gap-0.5 text-xs flex-1 min-w-0 overflow-hidden">
                {breadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-0.5 flex-shrink-0">
                    {i > 0 && <span className="text-gray-400">›</span>}
                    <button onClick={() => focusOrg(crumb.id)} className={`hover:text-blue-600 truncate max-w-24 ${i === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
              {(['組織図', 'レポートライン'] as CanvasMode[]).map(mode => (
                <button key={mode} onClick={() => setCanvasMode(mode)}
                  className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${canvasMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {mode}
                </button>
              ))}
            </div>
            {canvasMode === '組織図' && (
              <>
                <button
                  onClick={() => setFieldPickerOpen(true)}
                  className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  title="カードに表示するフィールドを設定"
                >表示設定</button>
                <button
                  onClick={() => { setIsSelectMode(m => !m); setSelectedPersonIds(new Set()) }}
                  className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                    isSelectMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >{isSelectMode ? '✓ 選択中' : '複数選択'}</button>
              </>
            )}
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
          className="flex-1 overflow-y-auto p-3"
          onDragOverCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
          onDragEnterCapture={isHistoryPreviewMode ? e => { e.stopPropagation() } : undefined}
        >
          {canvasMode === 'レポートライン' ? (
            <ReportLineView
              allocationList={allocationList}
              personBySfId={personBySfId}
              afterOrgByCode={afterOrgByCode}
              organizations={organizations}
              persons={persons}
              selectedPersonId={selectedPersonId}
              selectPerson={selectPerson}
              saveRow={saveRow}
              handlePersonDoubleClick={handlePersonDoubleClick}
              handlePersonContextMenu={handlePersonContextMenu}
              reportLineRootId={reportLineRootId}
              setReportLineRootId={setReportLineRootId}
              rlRootManagerId={rlRootManagerId}
              expandedNodes={expandedNodes}
              setExpandedNodes={setExpandedNodes}
              isReportLineInternalSelect={isReportLineInternalSelect}
            />
          ) : childOrgs.length === 0 ? (
            <OrgBox orgId={focusedOrgId} depth={0} />
          ) : (
            <div className={`border-2 rounded-lg transition-all ${dragOverOrgId === focusedOrgId ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
              <div className="px-3 py-2 border-b border-gray-300 bg-gray-100 rounded-t-lg flex items-center gap-1">
                <span className="text-sm font-semibold text-gray-700 flex-1">{focusedOrg.name}</span>
                <button
                  onClick={() => handleAddPosition(focusedOrgId, focusedOrg.externalCode ?? focusedOrg.id)}
                  className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                  title="ポジションを追加（空席）"
                >＋席</button>
              </div>
              <div className="px-3 py-2" onDragOver={e => handleDragOver(e, focusedOrgId)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, focusedOrgId)}>
                <PositionRows orgId={focusedOrgId} />
                <DropZone orgId={focusedOrgId} compact />
              </div>
              <div className="px-3 pb-3 grid grid-cols-2 gap-3">
                {childOrgs.map(c => <OrgBox key={c.id} orgId={c.id} depth={0} />)}
              </div>
            </div>
          )}
        </div>

        {contextMenu && (
          <PersonContextMenu
            x={contextMenu.x} y={contextMenu.y}
            personId={contextMenu.personId}
            persons={persons}
            canvasMode={canvasMode}
            onEdit={id => { handlePersonDoubleClick(id) }}
            onReportRoot={id => { setReportLineRootId(id); setExpandedNodes(prev => new Set([...prev, id])) }}
            onClose={() => setContextMenu(null)}
          />
        )}

        {positionContextMenu && (
          <PositionContextMenu
            x={positionContextMenu.x} y={positionContextMenu.y}
            rowId={positionContextMenu.rowId}
            persons={persons}
            allocationList={allocationList}
            onEdit={rowId => enterEditMode(rowId)}
            onChangeTitle={rowId => { setChangeTitleRowId(rowId); setPositionContextMenu(null) }}
            onClose={() => setPositionContextMenu(null)}
          />
        )}

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
