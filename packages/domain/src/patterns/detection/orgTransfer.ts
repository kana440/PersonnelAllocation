// 組織異動・改変系の変更検知: 社内異動・組織改変・上司変更
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'

export function detectOrgTransfer(
  row: AllocationRow,
  sameOrgPairs?: Set<string>,
): Set<EditPattern> {
  const out = new Set<EditPattern>()

  const prevCode    = row.prevDepartmentCode ?? ''
  const afterCode   = row.departmentCode     ?? ''
  const deptChanged = prevCode !== afterCode

  const isSameOrgPair = deptChanged && (sameOrgPairs?.has(`${prevCode}|${afterCode}`) ?? false)
  const isTransfer    = deptChanged && !isSameOrgPair

  if (isTransfer) out.add('orgTransfer')

  // 組織改変: 組織コードが変わったが positionCode は同じ（席はそのまま）
  if (
    prevCode !== '' && afterCode !== '' && isTransfer &&
    (row.prevPositionCode ?? '') !== '' &&
    (row.positionCode ?? '') === (row.prevPositionCode ?? '')
  ) {
    out.add('orgRestructure')
  }

  // 上司変更
  if ((row.managerPositionCode ?? '') !== (row.prevManagerPositionCode ?? '')) {
    out.add('managerChange')
  }

  return out
}
