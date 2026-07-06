/**
 * row/consistency.ts — W2: 2段階昇降格ワーニング (RowRule 実装)
 *
 * G1（昇降格でポジション変更必須）は changes?: RowChanges に依存するため RowRule 化できず、
 * validate/globalConsistency.ts に残す。
 */

import type { AllocationRow }  from '../../allocationRow'
import type { RowRule, RowRuleCtx } from '../rowRule'
import type { ValidationIssue } from '../validate/types'
import { findEmpType }         from '../field'

const w2: RowRule = {
  id:    'W2-promotionDemotionWarning',
  scope: 'state',
  when: (row, masters) => {
    const et = findEmpType(masters, row)
    return !!(et?.isRegularEmployee && row.userId && row.userId === row.groupEmployeeId)
  },
  validate(row: AllocationRow, ctx: RowRuleCtx): ValidationIssue[] {
    const bandEntry     = ctx.masters.jobLevels.find(e => e.label === (row.band     as string | undefined))
    const prevBandEntry = ctx.masters.jobLevels.find(e => e.label === (row.prevBand as string | undefined))

    const level     = bandEntry?.promotionDemotionWarningLevel     ?? 0
    const prevLevel = prevBandEntry?.promotionDemotionWarningLevel ?? 0

    if (level === 0 || prevLevel === 0)           return []
    if (Math.abs(level - prevLevel) < 2)           return []

    return [{
      field:   'band',
      level:   'warning',
      message: '２段階の昇降格が検出されました。問題ないか確認してください',
      id:      'warning_two_step',
    }]
  },
}

export const GLOBAL_CONSISTENCY_RULES: RowRule[] = [w2]
