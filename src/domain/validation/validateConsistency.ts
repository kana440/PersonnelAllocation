import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { RowChanges } from '../review/changeDetection'
import type { ValidationIssue } from './types'
import { findEmpType } from '../valueRules'

// G系: データ整合性チェック（エラー）
// W系: ワーニングチェック（保存はブロックしないが確認を促す）

/**
 * G1: 昇級・降級（同一対応組織内のバンド変更）でポジションが変わっていない場合はエラー。
 * ポジション未変更のまま band だけ変えることは HR 運用上許容されない。
 */
function checkG1_bandChangeRequiresNewPosition(row: AllocationRow, changes?: RowChanges): ValidationIssue[] {
  if (!changes) return []
  const { kinds } = changes
  const isSameOrgBandChange =
    (kinds.has('promotion') || kinds.has('demotion')) && !kinds.has('transfer')
  if (!isSameOrgBandChange) return []

  const positionChanged = (row.positionCode ?? '') !== (row.prevPositionCode ?? '')
  if (positionChanged) return []

  return [{
    field:   'positionCode',
    level:   'error',
    message: '昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です）',
  }]
}

/**
 * W2: F2条件（社員・グループ社員ID一致）で、band と prevBand の昇降格ワーニング要チェック値の差が2以上の場合にワーニング。
 * どちらかの値が 0 の場合は判定対象外（出向受入など昇降格判定対象外のバンド）。
 */
function checkW2_promotionDemotionWarning(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const et = findEmpType(codeLists, row)
  if (!et?.isEmployee || !row.userId || row.userId !== row.groupEmployeeId) return []

  const bandEntry     = codeLists.jobLevels.find(e => e.label === (row.band     as string | undefined))
  const prevBandEntry = codeLists.jobLevels.find(e => e.label === (row.prevBand as string | undefined))

  const level     = bandEntry?.promotionDemotionWarningLevel     ?? 0
  const prevLevel = prevBandEntry?.promotionDemotionWarningLevel ?? 0

  if (level === 0 || prevLevel === 0) return []
  if (Math.abs(level - prevLevel) < 2) return []

  return [{
    field:   'band',
    level:   'warning',
    message: '２段階の昇降格が検出されました。問題ないか確認してください',
  }]
}

export function runConsistency(
  row:       AllocationRow,
  codeLists: AllCodeLists,
  changes?:  RowChanges,
): ValidationIssue[] {
  return [
    ...checkG1_bandChangeRequiresNewPosition(row, changes),
    ...checkW2_promotionDemotionWarning(row, codeLists),
  ]
}
