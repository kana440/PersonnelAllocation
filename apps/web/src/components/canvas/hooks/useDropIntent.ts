import { useState } from 'react'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface DropIntentState {
  fromRowId:            number | null
  personId:             string
  toOrgId:              string
  /** ドロップの種別 */
  dropType:             'org' | 'person' | 'gap'
  /** ドロップ後の上司として設定する positionCode（person/gap ドロップ時のみ） */
  managerPositionCode?: string
}

export interface DropOpState {
  def:             EditOperation
  row:             AllocationRow
  overrideInitial: Partial<AllocationRow>
}

export function useDropIntent() {
  const [dropIntentState, setDropIntentState] = useState<DropIntentState | null>(null)
  const [dropOpState,     setDropOpState]     = useState<DropOpState | null>(null)

  const handleIntentPick = (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => {
    setDropIntentState(null)
    setDropOpState({ def, row, overrideInitial })
  }

  const closeDropOp = () => setDropOpState(null)

  return {
    dropIntentState, setDropIntentState,
    dropOpState,     setDropOpState,
    handleIntentPick, closeDropOp,
  }
}
