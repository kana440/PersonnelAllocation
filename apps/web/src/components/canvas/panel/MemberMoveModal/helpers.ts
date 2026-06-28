import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface CandidateEntry {
  row:         AllocationRow
  name:        string
  beforePath:  string  // 旧組織のフルパス（prevDepartmentCode）
  currentOrg:  string  // 現（新）組織名
  band:        string
  posTitle:    string
}

/** 組織コードからその組織の名前と上位2階層をつなげたパスを返す */
export function buildOrgShortPath(orgCode: string | undefined, orgs: Organization[]): string {
  if (!orgCode) return ''
  const leaf = orgs.find(o => o.externalCode === orgCode)
  if (!leaf) return orgCode
  const parts: string[] = [leaf.name]
  let cur = orgs.find(o => o.id === leaf.parentId)
  if (cur) {
    parts.unshift(cur.name)
    const grandParent = orgs.find(o => o.id === cur!.parentId)
    if (grandParent) parts.unshift('…')
  }
  return parts.join(' > ')
}

export function buildCandidates(
  allocationList:    readonly AllocationRow[],
  afterOrgs:         Organization[],
  beforeOrgs:        Organization[],
  targetOrgCode:     string,
): CandidateEntry[] {
  const results: CandidateEntry[] = []
  for (const row of allocationList) {
    if (!row.userId)                               continue  // 空席
    if (row.concurrentType === '兼務')             continue  // 兼務行除外
    if (row.departmentCode === targetOrgCode)      continue  // 既に対象組織
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
    if (!name)                                     continue
    results.push({
      row,
      name,
      beforePath:  buildOrgShortPath(row.prevDepartmentCode as string | undefined, beforeOrgs),
      currentOrg:  afterOrgs.find(o => o.externalCode === row.departmentCode)?.name ?? (row.departmentCode as string | undefined) ?? '',
      band:        (row.positionBand as string | undefined) ?? '',
      posTitle:    (row.officialPositionCode ?? row.localJobTitle ?? '') as string,
    })
  }
  return results
}
