import type { AllocationRow } from '../allocationRow'
import type { AllMasters }  from '../masters/aggregate'

export type DerivedUpdates = Partial<Omit<AllocationRow, 'rowId' | 'operationGroupId'>>

export interface DerivationContext {
  readonly masters:      AllMasters
  readonly allocationList: readonly AllocationRow[]
}
