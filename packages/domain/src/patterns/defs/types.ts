import type { AllocationRow } from '../../allocationRow'
import type { AllCodeLists }  from '../../masters/aggregate'
import type { DetectContext } from '../detection/helpers'

export interface EditPatternMeta {
  label:      string
  addLabel:   string
  editLabel:  string
  badgeColor: string
  group:      'jobClassification' | 'position' | 'person' | 'legacy'
  menuLabel?: string
  availableFor?: (row: AllocationRow, codeLists: AllCodeLists) => boolean
  /** 変更パターンを検知する関数。noCheckRequired の場合は異動事由宣言ベースで判定する */
  detect: (row: AllocationRow, ctx: DetectContext) => boolean
}
