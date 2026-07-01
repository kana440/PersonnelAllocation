import type { AllocationRow } from '../../allocationRow'

export type ValidationLevel = 'warning' | 'error'

export interface ValidationIssue {
  field:   keyof AllocationRow
  level:   ValidationLevel
  message: string
}
