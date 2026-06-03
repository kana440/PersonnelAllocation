import type { AllocationRow } from '../allocationRow'
import type { Organization }  from '../schemas'

/**
 * Returns the set of after-org IDs that appear in at least one row's
 * departmentCode — used to surface "relevant" orgs at the top of the picker.
 */
export function collectRelevantOrgIds(
  rows:      AllocationRow[],
  afterOrgs: Organization[],
): Set<string> {
  const codeToId = new Map(
    afterOrgs.map(o => [o.externalCode ?? o.id, o.id]),
  )
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.departmentCode) {
      const id = codeToId.get(r.departmentCode)
      if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * 関連組織のうち、祖先が関連組織に含まれないもの（最上位組織）だけを返す。
 * 例: 技術部/開発G と 技術部/PMG が両方 relevant なら、「技術部」だけを返す。
 */
export function collectTopLevelRelevantOrgIds(
  rows:      AllocationRow[],
  afterOrgs: Organization[],
): Set<string> {
  const direct = collectRelevantOrgIds(rows, afterOrgs)
  const orgById = new Map(afterOrgs.map(o => [o.id, o]))
  const top = new Set<string>()
  for (const orgId of direct) {
    let cur = orgById.get(orgId)
    let dominated = false
    while (cur?.parentId) {
      if (direct.has(cur.parentId)) { dominated = true; break }
      cur = orgById.get(cur.parentId)
    }
    if (!dominated) top.add(orgId)
  }
  return top
}

/** Build a human-readable breadcrumb path for an org, e.g. "会社 > BU > 部門". */
export function buildOrgPath(orgId: string, orgById: Map<string, Organization>): string {
  const parts: string[] = []
  let current = orgById.get(orgId)
  while (current) {
    parts.unshift(current.name)
    current = current.parentId ? orgById.get(current.parentId) : undefined
  }
  return parts.join(' > ')
}
