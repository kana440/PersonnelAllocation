import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { MoveRowsToOrgOperation }      from '../../domain/operation/handlers/moveRowsToOrg'
import { SetPositionManagerOperation } from '../../domain/operation/handlers/positionOps'
import { appService } from '../../application/HRApplicationService'
import { useScopedStore } from '../../store/useScopedStore'
import { ConfirmDialog }    from './modals/ConfirmDialog'
import { PersonMoveModal }  from './modals/PersonMoveModal'
import { SelectMoveModal }  from './modals/SelectMoveModal'
import { BulkMoveModal }    from './modals/BulkMoveModal'
import { ReportLineView }   from './components/ReportLineView'
import { OrgBox, DropZone, AddPositionInput } from './components/OrgBox'
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
  const [confirmDialog,     setConfirmDialog]     = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [addPositionOrgId,  setAddPositionOrgId]  = useState<string | null>(null)
  const [addPositionTitle,  setAddPositionTitle]  = useState('')
  const [isSelectMode,      setIsSelectMode]      = useState(false)
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set())
  const [moveModalOpen,     setMoveModalOpen]     = useState(false)

  // ── Hooks ──────────────────────────────────────────────────────
  const { personMoveDialog, setPersonMoveDialog, handlePersonMoveConfirm } = usePersonMove({
    persons, allocationList, afterOrgByCode, allAfterOrgsUnscoped,
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

  const togglePersonSelection = (personId: string) => setSelectedPersonIds(prev => {
    const next = new Set(prev); next.has(personId) ? next.delete(personId) : next.add(personId); return next
  })

  const exitSelectMode = () => { setIsSelectMode(false); setSelectedPersonIds(new Set()) }

  const topPositionCodeOfOrg = (orgId: string): string | undefined => {
    const rows   = allocationList.filter(r => afterOrgByCode.get(r.departmentCode ?? '')?.id === orgId && !!r.positionCode)
    const posSet = new Set(rows.map(r => r.positionCode).filter(Boolean))
    return rows.find(r => !r.managerPositionCode || !posSet.has(r.managerPositionCode))?.positionCode
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
    addPositionOrgId, addPositionTitle, setAddPositionTitle,
    setAddPositionOrgId:  isHistoryPreviewMode ? () => {} : setAddPositionOrgId,
    topPositionCodeOfOrg,
    setBulkMoveSourceId:  isHistoryPreviewMode ? () => {} : setBulkMoveSourceId,
    setConfirmDialog:     isHistoryPreviewMode ? () => {} : setConfirmDialog,
    isSelectMode, selectedPersonIds, togglePersonSelection,
    selectedPersonId, selectPerson,
    isHistoryPreviewMode,
    handlePersonDoubleClick, handlePersonContextMenu,
    handlePositionContextMenu, handleDropPositionOnPosition,
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
                <span className="text-xs text-gray-400">Alt+ドロップ=兼務</span>
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
                  onClick={() => { setAddPositionOrgId(focusedOrgId); setAddPositionTitle('') }}
                  className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                  title="ポジションを追加（空席）"
                >＋席</button>
              </div>
              <div className="px-3 py-2" onDragOver={e => handleDragOver(e, focusedOrgId)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, focusedOrgId)}>
                <PositionRows orgId={focusedOrgId} />
                {addPositionOrgId === focusedOrgId && <AddPositionInput orgId={focusedOrgId} orgCode={focusedOrg.externalCode ?? focusedOrg.id} />}
                <DropZone orgId={focusedOrgId} compact />
              </div>
              <div className="px-3 pb-3 grid grid-cols-2 gap-3">
                {childOrgs.map(c => <OrgBox key={c.id} orgId={c.id} depth={0} />)}
              </div>
            </div>
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null) }} />
            <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36" style={{ left: contextMenu.x, top: contextMenu.y }}>
              {(() => { const p = persons.find(pp => pp.id === contextMenu.personId); return p ? <div className="px-3 py-1.5 border-b border-gray-100 text-xs font-semibold text-gray-500 truncate">{p.name}</div> : null })()}
              <button onClick={() => { handlePersonDoubleClick(contextMenu.personId); setContextMenu(null) }} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors">
                <span>✏️</span> 編集画面を開く
              </button>
              {canvasMode === 'レポートライン' && (
                <button
                  onClick={() => { setReportLineRootId(contextMenu.personId); setExpandedNodes(prev => new Set([...prev, contextMenu.personId])); setContextMenu(null) }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                ><span>📍</span> この人を起点に表示</button>
              )}
            </div>
          </>
        )}

        {/* Position context menu */}
        {positionContextMenu && (() => {
          const row    = allocationList.find(r => r.rowId === positionContextMenu.rowId)
          const person = row?.userId ? persons.find(p => p.sfPersonId === row.userId) : null
          const title  = row?.localJobTitle || row?.officialPositionCode || row?.positionCode || '（役職未設定）'
          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPositionContextMenu(null)} onContextMenu={e => { e.preventDefault(); setPositionContextMenu(null) }} />
              <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-40" style={{ left: positionContextMenu.x, top: positionContextMenu.y }}>
                <div className="px-3 py-1.5 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-700 truncate">{title}</div>
                  {person && <div className="text-[11px] text-gray-400 truncate">{person.name}</div>}
                  {!person && <div className="text-[11px] text-gray-400">空席</div>}
                </div>
                {row && (
                  <button
                    onClick={() => { enterEditMode(row.rowId); setPositionContextMenu(null) }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                  >
                    <span>✏️</span> 編集画面を開く
                  </button>
                )}
              </div>
            </>
          )
        })()}

        {/* 選択モード アクションバー */}
        {isSelectMode && selectedPersonIds.size > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900 text-white rounded-full px-4 py-2 shadow-2xl text-xs">
            <span className="font-semibold">{selectedPersonIds.size}名選択中</span>
            <div className="w-px h-4 bg-gray-600" />
            <button onClick={() => setMoveModalOpen(true)} className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors">組織を移動</button>
            <button onClick={exitSelectMode} className="px-2.5 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">解除</button>
          </div>
        )}

        {moveModalOpen && (
          <SelectMoveModal
            selectedCount={selectedPersonIds.size}
            allOrgs={allAfterOrgsUnscoped}
            onConfirm={targetOrgId => {
              const rowIds: number[] = []
              for (const personId of selectedPersonIds) {
                const person = persons.find(p => p.id === personId)
                if (!person?.sfPersonId) continue
                const primary = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
                             ?? allocationList.find(r => r.userId === person.sfPersonId)
                if (primary) rowIds.push(primary.rowId)
              }
              const targetOrg = allAfterOrgsUnscoped.find(o => o.id === targetOrgId)
              const result = appService.executeOperation(new MoveRowsToOrgOperation(rowIds, targetOrgId, `${rowIds.length}名 → ${targetOrg?.name ?? ''}`))
              if (!result.ok) return
              setMoveModalOpen(false); exitSelectMode()
            }}
            onCancel={() => setMoveModalOpen(false)}
          />
        )}

        {bulkMoveSourceId && (
          <BulkMoveModal
            sourceOrg={allAfterOrgsUnscoped.find(o => o.id === bulkMoveSourceId)}
            moveableOrgs={allAfterOrgsUnscoped.filter(o => o.id !== bulkMoveSourceId)}
            posEntries={positionTreeByOrgId.get(bulkMoveSourceId) ?? []}
            personList={afterMembersByOrgId.get(bulkMoveSourceId) ?? []}
            onConfirm={handleBulkMoveConfirm}
            onCancel={() => setBulkMoveSourceId(null)}
          />
        )}

        {personMoveDialog && (() => {
          const person  = persons.find(p => p.id === personMoveDialog.personId)
          const fromRow = personMoveDialog.fromRowId
            ? allocationList.find(r => r.rowId === personMoveDialog.fromRowId)
            : (allocationList.find(r => r.userId === person?.sfPersonId && !r.concurrentType)
              ?? allocationList.find(r => r.userId === person?.sfPersonId))
          const toOrg = allAfterOrgsUnscoped.find(o => o.id === personMoveDialog.toOrgId)
          return (
            <PersonMoveModal
              personName={person?.name ?? '—'}
              toOrgName={toOrg?.name ?? '—'}
              posTitle={fromRow?.localJobTitle || fromRow?.officialPositionCode || ''}
              hasPosition={!!fromRow?.positionCode}
              onConfirm={handlePersonMoveConfirm}
              onCancel={() => setPersonMoveDialog(null)}
            />
          )
        })()}

        {confirmDialog && (
          <ConfirmDialog
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

      </div>
    </OrgViewContext.Provider>
  )
}
