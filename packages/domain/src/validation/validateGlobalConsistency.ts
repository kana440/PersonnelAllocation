import type { AllocationRow } from '../allocationRow'
import type { AllMasters } from '../masters/aggregate'
import type { RowChanges } from '../patterns/changeDetection'
import type { ValidationIssue } from './types'
import type { Organization } from '../schemas'
import { findEmpType } from '../fieldConstraints'
import { buildFlatOrgView } from '../choices/orgTree'

// G系: データ整合性チェック（エラー）
// W系: ワーニングチェック（保存はブロックしないが確認を促す）

/**
 * G1: 昇級・降級（同一対応組織内のバンド変更）でポジションが変わっていない場合はエラー。
 * ポジション未変更のまま band だけ変えることは HR 運用上許容されない。
 */
function checkG1_bandChangeRequiresNewPosition(row: AllocationRow, changes?: RowChanges): ValidationIssue[] {
  if (!changes) return []
  const { patterns } = changes
  const isSameOrgBandChange =
    (patterns.has('promotion') || patterns.has('demotion')) && !patterns.has('orgTransfer')
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
function checkW2_promotionDemotionWarning(row: AllocationRow, masters: AllMasters): ValidationIssue[] {
  const et = findEmpType(masters, row)
  if (!et?.isRegularEmployee || !row.userId || row.userId !== row.groupEmployeeId) return []

  const bandEntry     = masters.jobLevels.find(e => e.label === (row.band     as string | undefined))
  const prevBandEntry = masters.jobLevels.find(e => e.label === (row.prevBand as string | undefined))

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

/**
 * W3: 上司のポジションコードが設定されていて、かつ上司の組織が当該行の組織の
 * 直系上位（祖先）でも同一でもない場合にワーニング。
 * managerPositionCode がない行はスキップ（ファイル分割など上司なし行は影響なし）。
 */
function checkW3_managerNotInAncestorOrg(
  row:                AllocationRow,
  allocationList:     AllocationRow[],
  afterOrganizations: Organization[],
): ValidationIssue[] {
  const mgrPosCode = row.managerPositionCode as string | undefined
  if (!mgrPosCode) return []

  const mgrRow     = allocationList.find(r => (r.positionCode as string | undefined) === mgrPosCode)
  const rowDeptCode = row.departmentCode     as string | undefined
  const mgrDeptCode = mgrRow?.departmentCode as string | undefined

  if (!mgrRow || !rowDeptCode || !mgrDeptCode) return []
  if (rowDeptCode === mgrDeptCode) return []  // 同一組織はOK

  const flatView = buildFlatOrgView(afterOrganizations)
  const rowEntry  = flatView.find(e => e.orgCode === rowDeptCode)
  if (!rowEntry) return []

  // mgrDeptCode が rowDeptCode の直系上位（ancestorCodes）に含まれていれば正常
  if (rowEntry.ancestorCodes.includes(mgrDeptCode)) return []

  const mgrName = [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(' ') || mgrPosCode
  return [{
    field:   'managerPositionCode' as keyof AllocationRow,
    level:   'warning',
    message: `上司（${mgrName}）が直系上位組織以外（${mgrDeptCode}）に所属しています。組織ツリーを確認してください`,
  }]
}

export function runGlobalConsistency(
  row:                AllocationRow,
  masters:            AllMasters,
  changes?:           RowChanges,
  allocationList?:    AllocationRow[],
  afterOrganizations?: Organization[],
): ValidationIssue[] {
  return [
    ...checkG1_bandChangeRequiresNewPosition(row, changes),
    ...checkW2_promotionDemotionWarning(row, masters),
    ...(allocationList && afterOrganizations
      ? checkW3_managerNotInAncestorOrg(row, allocationList, afterOrganizations)
      : []),
  ]
}
