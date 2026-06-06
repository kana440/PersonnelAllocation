import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

/** 旧組織の直属メンバー（子孫を含まない）を重複なく返す */
export function computeDirectBeforeMembers(
  orgId: string,
  allocationList: AllocationRow[],
  beforeOrgs: Organization[],
): AllocationRow[] {
  const org = beforeOrgs.find(o => o.id === orgId)
  if (!org?.externalCode) return []
  const code = org.externalCode
  const seen = new Set<number>()
  return allocationList.filter(r => {
    if (!r.prevDepartmentCode || r.prevDepartmentCode !== code || !r.userId) return false
    if (seen.has(r.rowId)) return false
    seen.add(r.rowId)
    return true
  })
}

/** 新組織群の直属メンバー（子孫を含まない）を重複なく返す */
export function computeDirectAfterMembers(
  orgIds: string[],
  allocationList: AllocationRow[],
  afterOrgs: Organization[],
): AllocationRow[] {
  if (orgIds.length === 0) return []
  const codes = new Set(
    orgIds.flatMap(id => {
      const org = afterOrgs.find(o => o.id === id)
      return org?.externalCode ? [org.externalCode] : []
    })
  )
  const seen = new Set<number>()
  return allocationList.filter(r => {
    if (!r.departmentCode || !codes.has(r.departmentCode) || !r.userId) return false
    if (seen.has(r.rowId)) return false
    seen.add(r.rowId)
    return true
  })
}
