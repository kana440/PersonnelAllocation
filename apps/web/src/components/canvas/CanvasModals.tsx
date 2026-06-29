import type { Person } from '@personnel/domain/schemas'
import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { PositionEntry, MemberEntry } from './OrgViewContext'
import type { BulkMoveConfirmParams } from './modals/BulkMoveModal'
import type { DropIntentState, DropOpState, DragBatchItem } from './hooks/useDropIntent'
import { useMemo }                   from 'react'
import { appService }                from '../../application/HRApplicationService'
import { MoveRowsToOrgOperation }    from '@personnel/domain/commands/handlers/moveRowsToOrg'
import { ConfirmDialog }             from './modals/ConfirmDialog'
import { SelectMoveModal }           from './modals/SelectMoveModal'
import { BulkMoveModal }             from './modals/BulkMoveModal'
import {
  BulkTransferReasonModal,
  BulkManagerModal,
  BulkSecondmentModal,
} from './modals/BulkActionModals'
import { CanvasFieldPicker }   from './CanvasFieldPicker'
import { DragIntentPicker }    from './modals/DragIntentPicker'
import { DropOperationModal }  from './modals/DropOperationModal'
import { QuickEditDialog }     from '../editor/PersonOperationPanel/QuickEditDialog'
import { RestoreVacantPositionModal } from './modals/RestoreVacantPositionModal'
import type { EditOperation }  from '@personnel/domain/commands/defs/index'

export interface CanvasModalsProps {
  // selection bar
  isSelectMode:       boolean
  selectedPersonIds:  Set<string>
  exitSelectMode:     () => void
  // modals open state
  moveModalOpen:      boolean
  setMoveModalOpen:   (v: boolean) => void
  bulkActionModal:    'transferReason' | 'manager' | 'secondment' | null
  setBulkActionModal: (v: 'transferReason' | 'manager' | 'secondment' | null) => void
  bulkMoveSourceId:   string | null
  setBulkMoveSourceId:(v: string | null) => void
  dropIntentState:    DropIntentState | null
  setDropIntentState: (v: DropIntentState | null) => void
  dropOpState:        DropOpState | null
  setDropOpState:     (v: DropOpState | null) => void
  /** バンド間ドラッグ: quickInputs フォームで開く昇格/降格操作 */
  bandDropOpState:    DropOpState | null
  setBandDropOpState: (v: DropOpState | null) => void
  confirmDialog:      { message: string; onConfirm: () => void } | null
  setConfirmDialog:   (v: { message: string; onConfirm: () => void } | null) => void
  fieldPickerOpen:             boolean
  setFieldPickerOpen:          (v: boolean) => void
  restoreVacantPositionOpen:   boolean
  setRestoreVacantPositionOpen:(v: boolean) => void
  // data
  persons:            Person[]
  allocationList:     AllocationRow[]
  allAfterOrgsUnscoped: Organization[]
  positionTreeByOrgId: Map<string, PositionEntry[]>
  afterMembersByOrgId: Map<string, MemberEntry[]>
  // callbacks
  handleBulkMoveConfirm:      (params: BulkMoveConfirmParams) => void
  handleIntentPick:            (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => void
  handleImmediateTransfer:     (def: EditOperation, row: AllocationRow, values: Partial<AllocationRow>) => void
  handleBatchTransfer:         (label: string, items: DragBatchItem[]) => void
}

export function CanvasModals({
  isSelectMode: _isSelectMode, selectedPersonIds, exitSelectMode,
  moveModalOpen, setMoveModalOpen,
  bulkActionModal, setBulkActionModal,
  bulkMoveSourceId, setBulkMoveSourceId,
  dropIntentState, setDropIntentState,
  dropOpState, setDropOpState,
  bandDropOpState, setBandDropOpState,
  confirmDialog, setConfirmDialog,
  fieldPickerOpen, setFieldPickerOpen,
  restoreVacantPositionOpen, setRestoreVacantPositionOpen,
  persons, allocationList, allAfterOrgsUnscoped,
  positionTreeByOrgId, afterMembersByOrgId,
  handleBulkMoveConfirm, handleIntentPick, handleImmediateTransfer, handleBatchTransfer,
}: CanvasModalsProps) {
  const { secondmentOrgCodes, masters } = useMemo(() => {
    const snap = appService.getSnapshot()
    return {
      masters:            snap.masters,
      secondmentOrgCodes: new Set(
        snap.masters.orgMasterEntries
          .filter(e => e.orgCategory?.includes('出向者用組織'))
          .map(e => e.code),
      ),
    }
  }, [allAfterOrgsUnscoped])

  const handleMoveConfirm = (targetOrgId: string) => {
    const rowIds: number[] = []
    for (const personId of selectedPersonIds) {
      const person = persons.find(p => p.id === personId)
      if (!person?.sfPersonId) continue
      const primary = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
                   ?? allocationList.find(r => r.userId === person.sfPersonId)
      if (primary) rowIds.push(primary.rowId)
    }
    const targetOrg = allAfterOrgsUnscoped.find(o => o.id === targetOrgId)
    const result = appService.executeOperation(
      new MoveRowsToOrgOperation(rowIds, targetOrgId, `${rowIds.length}名 → ${targetOrg?.name ?? ''}`)
    )
    if (!result.ok) return
    setMoveModalOpen(false)
    exitSelectMode()
  }

  return (
    <>
      {/* 選択モード アクションバー */}
      {selectedPersonIds.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-gray-900 text-white rounded-full px-4 py-2 shadow-2xl text-xs">
          <span className="font-semibold mr-1">{selectedPersonIds.size}名選択中</span>
          <div className="w-px h-4 bg-gray-600" />
          <button onClick={() => setMoveModalOpen(true)}               className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors">組織移動</button>
          <button onClick={() => setBulkActionModal('manager')}        className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors">上司変更</button>
          <button onClick={() => setBulkActionModal('transferReason')} className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors">異動事由</button>
          <button onClick={() => setBulkActionModal('secondment')}     className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors">出向</button>
          <div className="w-px h-4 bg-gray-600" />
          <button onClick={exitSelectMode} className="px-2.5 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">解除</button>
        </div>
      )}

      {moveModalOpen && (
        <SelectMoveModal
          selectedCount={selectedPersonIds.size}
          allOrgs={allAfterOrgsUnscoped}
          onConfirm={handleMoveConfirm}
          onCancel={() => setMoveModalOpen(false)}
        />
      )}

      {bulkActionModal === 'transferReason' && (
        <BulkTransferReasonModal
          selectedPersonIds={selectedPersonIds}
          persons={persons}
          allocationList={allocationList}
          onDone={() => { setBulkActionModal(null); exitSelectMode() }}
          onCancel={() => setBulkActionModal(null)}
        />
      )}
      {bulkActionModal === 'manager' && (
        <BulkManagerModal
          selectedPersonIds={selectedPersonIds}
          persons={persons}
          allocationList={allocationList}
          onDone={() => { setBulkActionModal(null); exitSelectMode() }}
          onCancel={() => setBulkActionModal(null)}
        />
      )}
      {bulkActionModal === 'secondment' && (
        <BulkSecondmentModal
          selectedPersonIds={selectedPersonIds}
          persons={persons}
          allocationList={allocationList}
          onDone={() => { setBulkActionModal(null); exitSelectMode() }}
          onCancel={() => setBulkActionModal(null)}
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

      {dropIntentState && (
        <DragIntentPicker
          state={dropIntentState}
          allocationList={allocationList}
          persons={persons}
          allOrgs={allAfterOrgsUnscoped}
          secondmentOrgCodes={secondmentOrgCodes}
          masters={masters}
          onPick={handleIntentPick}
          onImmediate={handleImmediateTransfer}
          onBatch={handleBatchTransfer}
          onCancel={() => setDropIntentState(null)}
        />
      )}

      {dropOpState && (
        <DropOperationModal
          def={dropOpState.def}
          row={dropOpState.row}
          overrideInitial={dropOpState.overrideInitial}
          onClose={() => setDropOpState(null)}
        />
      )}

      {bandDropOpState && bandDropOpState.def.quickInputs && (
        <QuickEditDialog
          def={bandDropOpState.def}
          row={bandDropOpState.row}
          overrideInitial={bandDropOpState.overrideInitial}
          onClose={() => setBandDropOpState(null)}
          onDetail={currentValues => {
            const state = bandDropOpState
            setBandDropOpState(null)
            setDropOpState({
              def:             state.def,
              row:             state.row,
              overrideInitial: { ...state.overrideInitial, ...currentValues },
            })
          }}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {fieldPickerOpen && <CanvasFieldPicker onClose={() => setFieldPickerOpen(false)} />}

      {restoreVacantPositionOpen && (
        <RestoreVacantPositionModal onClose={() => setRestoreVacantPositionOpen(false)} />
      )}
    </>
  )
}
