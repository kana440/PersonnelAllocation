import type { AllocationRow } from '../../allocationRow'
import type { AllMasters } from '../../masters/aggregate'

export function isOutsource(row: AllocationRow, ms: AllMasters): boolean {
  const et = row.employmentType as string | undefined
  if (!et) return false
  const entry = ms.employmentTypes.find(e => e.label === et || e.code === et)
  return entry?.isSecondmentAcceptance ?? false
}
