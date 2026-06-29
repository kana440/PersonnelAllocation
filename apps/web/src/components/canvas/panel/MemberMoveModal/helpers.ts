import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface CandidateEntry {
  row:          AllocationRow
  name:         string
  beforePath:   string  // 旧組織フルパス
  currentPath:  string  // 現組織フルパス
  band:         string
  posTitle:     string
  positionCode: string  // ポジション番号（検索用）
}

/** 組織コードからルートまで辿ったフルパスを返す（例: 本社 > 情報システム部 > 第1グループ） */
function buildOrgFullPath(orgCode: string | undefined, orgs: Organization[]): string {
  if (!orgCode) return ''
  const orgById = new Map(orgs.map(o => [o.id, o]))
  const leaf    = orgs.find(o => o.externalCode === orgCode)
  if (!leaf) return orgCode

  const parts: string[] = []
  let cur: Organization | undefined = leaf
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? orgById.get(cur.parentId) : undefined
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
    const posCode = (row.positionCode as string | undefined) ?? ''
    results.push({
      row,
      name,
      beforePath:   buildOrgFullPath(row.prevDepartmentCode as string | undefined, beforeOrgs),
      currentPath:  buildOrgFullPath(row.departmentCode     as string | undefined, afterOrgs),
      band:         (row.positionBand as string | undefined) ?? '',
      posTitle:     (row.officialPositionCode ?? row.localJobTitle ?? '') as string,
      positionCode: posCode.startsWith('_pos_') ? '' : posCode,
    })
  }
  return results
}
