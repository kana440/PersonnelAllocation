import type { AllocationRow } from '../../allocationRow'
import type { RowChanges } from '../../patterns/changeDetection'
import type { ValidationIssue } from './types'
import type { Organization } from '../../schemas'
import { buildFlatOrgView } from '../options/orgTree'

// G系: データ整合性チェック（エラー）
// W系: ワーニングチェック（保存はブロックしないが確認を促す）
//
// W2（2段階昇降格）は row/consistency.ts に移行済み。
// W3（上司が直系上位組織以外）はバッチでは INTER_ROW_RULES.managerOrgRule が担うが、
// 単行フォーム編集では allocationList が渡されるため引き続きここで処理する。

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
    id:      'interrow_promotion_no_pos',
  }]
}

/**
 * W3: 上司のポジションコードが設定されていて、かつ上司の組織が当該行の組織の
 * 直系上位（祖先）でも同一でもない場合にワーニング。
 * managerPositionCode がない行はスキップ（ファイル分割など上司なし行は影響なし）。
 *
 * バッチ処理では INTER_ROW_RULES.managerOrgRule（interRow/managerOrg.ts）が
 * O(R) で評価するため呼ばれない（batchValidate は allocationList:[] を渡す）。
 * 単行フォーム編集時のみ有効。
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
    id:      'warning_manager_org',
  }]
}

export function runGlobalConsistency(
  row:                 AllocationRow,
  changes?:            RowChanges,
  allocationList?:     AllocationRow[],
  afterOrganizations?: Organization[],
): ValidationIssue[] {
  return [
    ...checkG1_bandChangeRequiresNewPosition(row, changes),
    ...(allocationList && afterOrganizations
      ? checkW3_managerNotInAncestorOrg(row, allocationList, afterOrganizations)
      : []),
  ]
}
