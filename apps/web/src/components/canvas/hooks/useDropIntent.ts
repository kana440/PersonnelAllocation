import { useState }         from 'react'
import { appService }        from '../../../application/HRApplicationService'
import { bindOperation }     from '@personnel/domain/commands/defs/index'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface DropIntentState {
  fromRowId:            number | null
  personId:             string
  /** ドロップ先の組織 ID */
  toOrgId:              string
  /** ドラッグ元の組織 ID（person/gap ドロップ時のみ）*/
  fromOrgId?:           string
  /** ドロップの種別 */
  dropType:             'org' | 'person' | 'gap'
  /** ドロップ後の上司として設定する positionCode（person/gap ドロップ時のみ） */
  managerPositionCode?: string
  /** FloatingAbsencePanel からのドラッグ（復帰処理に使用） */
  fromAbsence?:         boolean
}

export interface DropOpState {
  def:             EditOperation
  row:             AllocationRow
  overrideInitial: Partial<AllocationRow>
}

export interface DragBatchItem {
  def:    EditOperation
  rowId:  number
  values: Partial<AllocationRow>
}

export function useDropIntent() {
  const [dropIntentState, setDropIntentState] = useState<DropIntentState | null>(null)
  const [dropOpState,     setDropOpState]     = useState<DropOpState | null>(null)

  /** フォームを開く（兼務・出向など入力が必要な操作） */
  const handleIntentPick = (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => {
    setDropIntentState(null)
    setDropOpState({ def, row, overrideInitial })
  }

  /** フォームを開かずに即時実行（移動系ドラッグ） */
  const handleImmediateTransfer = (def: EditOperation, row: AllocationRow, values: Partial<AllocationRow>) => {
    setDropIntentState(null)
    const command = bindOperation(def, row.rowId, values)
    appService.executeOperation(command)
  }

  /** 複数行を一括で即時実行（部下ごと移動） */
  const handleBatchTransfer = (label: string, items: DragBatchItem[]) => {
    setDropIntentState(null)
    const commands = items.map(item => bindOperation(item.def, item.rowId, item.values))
    appService.executeBatch(label, commands)
  }

  const closeDropOp = () => setDropOpState(null)

  return {
    dropIntentState, setDropIntentState,
    dropOpState,     setDropOpState,
    handleIntentPick,
    handleImmediateTransfer,
    handleBatchTransfer,
    closeDropOp,
  }
}
