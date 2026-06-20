import type { AllocationRow } from '../../allocationRow'
import type { AllCodeLists } from '../../masters/aggregate'

export function isOutsource(row: AllocationRow, cl: AllCodeLists): boolean {
  const et = row.employmentType as string | undefined
  if (!et) return false
  const entry = cl.employmentTypes.find(e => e.label === et || e.code === et)
  return entry?.isSecondmentAcceptance ?? false
}
