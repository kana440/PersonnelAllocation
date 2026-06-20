import type { AllocationRow } from '../../allocationRow'
import type { DetectContext } from '../detection/helpers'
import type { OperationBadge } from '../../commands/defs/badge'

export interface EditPatternMeta {
  label:      string
  addLabel:   string
  editLabel:  string
  badge:      OperationBadge
  group:      'jobClassification' | 'position' | 'person' | 'legacy'
  menuLabel?: string
  /** 変更パターンを検知する関数。noCheckRequired の場合は異動事由宣言ベースで判定する */
  detect: (row: AllocationRow, ctx: DetectContext) => boolean
}
