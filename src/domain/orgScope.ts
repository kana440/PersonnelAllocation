import type { Organization } from './schemas'
import type { AllocationRow } from './allocationRow'

// Returns the set of org IDs that are at or below rootOrgId in the hierarchy (inclusive).
export function getDescendantOrgIds(rootOrgId: string, allOrgs: Organization[]): Set<string> {
  const result = new Set<string>([rootOrgId])
  const queue  = [rootOrgId]
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const org of allOrgs) {
      if (org.parentId === parentId && !result.has(org.id)) {
        result.add(org.id)
        queue.push(org.id)
      }
    }
  }
  return result
}

// Returns allocation rows whose after-departmentCode falls within the given org scope.
// scopeOrgId = null means no filter (return all rows).
export function filterRowsByScope(
  rows:       AllocationRow[],
  scopeOrgId: string | null,
  afterOrgs:  Organization[],
): AllocationRow[] {
  if (!scopeOrgId) return rows

  const scopeIds    = getDescendantOrgIds(scopeOrgId, afterOrgs)
  const scopeCodes  = new Set(
    afterOrgs
      .filter(o => scopeIds.has(o.id) && o.externalCode)
      .map(o => o.externalCode as string)
  )
  return rows.filter(r => r.departmentCode && scopeCodes.has(r.departmentCode))
}

// Flattens the org tree into DFS order with depth, for display in dropdowns.
export function flattenOrgTree(
  allOrgs: Organization[],
): Array<{ org: Organization; depth: number }> {
  const byParent = new Map<string | null, Organization[]>()
  for (const org of allOrgs) {
    const key = org.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(org)
  }

  const result: Array<{ org: Organization; depth: number }> = []
  function visit(parentId: string | null, depth: number) {
    for (const org of byParent.get(parentId) ?? []) {
      result.push({ org, depth })
      visit(org.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}
