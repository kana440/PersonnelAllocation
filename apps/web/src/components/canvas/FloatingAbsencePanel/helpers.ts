import type { AllocationRow } from '@personnel/domain/allocationRow'
import { TR } from '@personnel/domain/transferReasonLabels'

export type AbsenceCategory = '退職' | '移籍'

export function getAbsenceCategory(row: AllocationRow): AbsenceCategory | null {
  const tr = row.transferReason as string | undefined
  if (tr === TR.TERMINATION) return '退職'
  if (tr === TR.TRANSFER)    return '移籍'
  return null
}

export function isAbsenceRow(row: AllocationRow): boolean {
  return getAbsenceCategory(row) !== null
}

export const ABSENCE_SHOW_THRESHOLD = 30
