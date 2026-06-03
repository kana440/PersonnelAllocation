import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists }  from '../codeLists/aggregate'

export type DerivedUpdates = Partial<Omit<AllocationRow, 'rowId' | 'operationGroupId'>>

export interface DerivationContext {
  readonly codeLists:      AllCodeLists
  readonly allocationList: readonly AllocationRow[]
}
