import type { AllocationRow } from '../../allocationRow'

export type ValidationLevel = 'warning' | 'error'

export interface ValidationIssue {
  field:   keyof AllocationRow
  level:   ValidationLevel
  message: string
  /** IssueTypeMeta.id — バリデータが直接セットすることで resolveIssueMeta の文字列マッチングが不要になる */
  id?:     string
}
