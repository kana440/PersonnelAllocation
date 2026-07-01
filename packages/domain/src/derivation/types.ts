import type { AllocationRow } from '../allocationRow'
import type { AllMasters }  from '../masters/aggregate'
import type { FieldStrictness } from '../optionStrictness'

export type DerivedUpdates = Partial<Omit<AllocationRow, 'rowId' | 'operationGroupId'>>

export interface DerivationContext {
  readonly masters:             AllMasters
  readonly allocationList:      readonly AllocationRow[]
  readonly strictnessOverrides?: Partial<Record<string, FieldStrictness>>
}
