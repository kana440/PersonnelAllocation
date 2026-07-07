import type { AllocationRow } from '../../allocationRow'

export type ValidationLevel = 'warning' | 'error'

export interface ValidationIssue {
  field:   keyof AllocationRow
  level:   ValidationLevel
  message: string
  /** IssueTypeMeta.id — バリデータが直接セットすることで resolveIssueMeta の O(1) ルックアップが可能 */
  id?:     string
  /** 確定的な修正値。evaluateFieldRule が allowed.length === 1 のとき付与する。
   *  UI はこれを "推奨ワンクリック修正" として表示する。 */
  suggestedPatch?: Partial<AllocationRow>
}
