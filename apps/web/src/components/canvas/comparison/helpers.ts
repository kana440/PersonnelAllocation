import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { OrgComparisonData, PersonComparisonEntry } from './types'

/**
 * before-org と対応する after-org（null = 未マッピング）を受け取り、
 * allocationList から在籍・転出・転入の分類を返す。
 */
export function computeOrgComparison(
  beforeOrg:   Organization,
  afterOrg:    Organization | null,
  allocationList: AllocationRow[],
  afterOrgs:   Organization[],
  beforeOrgs:  Organization[],
): OrgComparisonData {
  const beforeCode = beforeOrg.externalCode ?? ''
  const afterCode  = afterOrg?.externalCode ?? ''
  const autoMapped = !!beforeCode && !!afterCode && beforeCode === afterCode

  const persons: PersonComparisonEntry[] = []

  if (afterOrg) {
    // 旧組織に在籍していた人（prevDepartmentCode = beforeCode）
    for (const row of allocationList) {
      if (!row.userId) continue
      const prevCode = row.prevDepartmentCode ?? ''
      const currCode = row.departmentCode    ?? ''

      if (prevCode === beforeCode) {
        if (currCode === afterCode) {
          // 在籍（stayed）
          persons.push({ row, status: 'stayed', relatedOrgName: '' })
        } else {
          // 転出（moved-out）
          const destOrg = afterOrgs.find(o => o.externalCode === currCode)
          persons.push({ row, status: 'moved-out', relatedOrgName: destOrg?.name ?? currCode })
        }
      } else if (currCode === afterCode) {
        // 転入（moved-in）: 旧組織外から新組織に来た
        const srcOrg = beforeOrgs.find(o => o.externalCode === prevCode)
        const srcName = prevCode ? (srcOrg?.name ?? prevCode) : '（新規）'
        persons.push({ row, status: 'moved-in', relatedOrgName: srcName })
      }
    }
  } else {
    // 未マッピング: とりあえず旧組織にいた人だけ表示（全員 moved-out 扱い）
    for (const row of allocationList) {
      if (!row.userId) continue
      if ((row.prevDepartmentCode ?? '') === beforeCode) {
        const currCode = row.departmentCode ?? ''
        const destOrg  = afterOrgs.find(o => o.externalCode === currCode)
        persons.push({ row, status: 'moved-out', relatedOrgName: destOrg?.name ?? currCode })
      }
    }
  }

  return { beforeOrg, afterOrg, autoMapped, persons }
}

/** auto-resolve: beforeOrg.externalCode と同じ externalCode を持つ after-org を探す */
export function resolveAutoMappedAfterOrg(
  beforeOrg: Organization,
  afterOrgs:  Organization[],
): Organization | null {
  if (!beforeOrg.externalCode) return null
  return afterOrgs.find(o => o.externalCode === beforeOrg.externalCode) ?? null
}
