// allocationListMapper.ts
// 新モデルでは allocationList が after 列を直接持つため、
// ドメイン→行変換の複雑なロジックは不要になった。
// このファイルは UI 表示用メタデータの付与のみを行う。

import type { AllocationRow as BaseAllocationRow } from '../domain/allocationRow'
import type { Organization } from '../types/domain'

// UI/エクスポート用に _meta を付加した行型
export type AllocationRow = BaseAllocationRow & {
  readonly _meta: {
    operationType:    string   // 組織異動 / 昇格 / 変更なし 等
    operationGroupId: string | undefined
    hasOperation:     boolean
    companyId:        string
    companyName:      string
    hasSF:            boolean
  }
}

// computedRows（after 列計算済み）に _meta を付与して返す
export function toAllocationRows(
  computedRows:  BaseAllocationRow[],
  organizations: Organization[],
): AllocationRow[] {
  return computedRows.map((row, idx) => {
    const orgId    = row.departmentCode ?? ''
    const org      = organizations.find(o => o.externalCode === orgId || o.id === orgId)
    const companyId = org?.companyId ?? ''

    const operationType = deriveOperationType(row)
    const groupId       = row.operationGroupId

    return {
      ...row,
      no: row.no ?? String(idx + 1),
      _meta: {
        operationType,
        operationGroupId: groupId,
        hasOperation:     !!groupId,
        companyId,
        companyName: org?.name ?? companyId,
        hasSF:       true,
      },
    }
  })
}

function deriveOperationType(row: BaseAllocationRow): string {
  const prevDept = row.prevDepartmentCode ?? ''
  const afterDept = row.departmentCode ?? ''
  const prevBand = row.prevBand ?? row.prevPositionBand ?? ''
  const afterBand = row.band ?? row.positionBand ?? ''

  if (!prevDept && afterDept) return '新規採用'
  if (prevDept && !afterDept) return '退職'
  if (prevDept !== afterDept) return '組織異動'
  if (prevBand !== afterBand) return '昇格'
  return '変更なし'
}
