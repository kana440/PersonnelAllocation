import type { Organization } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'

// Root orgs = those whose parentId is null or not found in the set
export function getRootOrgs(orgs: Organization[]): Organization[] {
  const ids = new Set(orgs.map(o => o.id))
  return orgs.filter(o => !o.isAbandoned && (!o.parentId || !ids.has(o.parentId)))
}

// Available split levels (level >= 2, non-abandoned)
export function getAvailableLevels(orgs: Organization[]): number[] {
  const levels = new Set(orgs.filter(o => !o.isAbandoned && o.level >= 2).map(o => o.level))
  return [...levels].sort((a, b) => a - b)
}

// Build useThis map for a global "set all to depth N" action.
// Orgs at level < N → false (go deeper), orgs at level >= N → true (stop here).
export function buildUseThisForDepth(targetLevel: number, orgs: Organization[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  orgs.filter(o => !o.isAbandoned && o.level >= 2).forEach(o => {
    map.set(o.id, o.level >= targetLevel)
  })
  return map
}

// Recursive traversal that mirrors OrgTreeItem's isFrontier logic.
// An org is a group node when:
//   - isFrontier = true AND level >= 2 AND (useThis[id] !== false OR it is a leaf)
// Children become frontier when:
//   - parent is level 1 (always pass through), OR
//   - parent is frontier + level >= 2 + useThis[id] === false (going deeper)
export function computeGroupNodeIds(
  useThis: Map<string, boolean>,
  orgs: Organization[],
): Set<string> {
  const ids     = new Set<string>()
  const idToOrg = new Map(orgs.map(o => [o.id, o]))

  function traverse(orgId: string, isFrontier: boolean): void {
    const org = idToOrg.get(orgId)
    if (!org || org.isAbandoned) return
    const children    = orgs.filter(o => o.parentId === orgId && !o.isAbandoned)
    const isLeaf      = children.length === 0
    const useThisHere = useThis.get(orgId) ?? true  // default = stop here

    const isGroupNode = isFrontier && org.level >= 2 && (useThisHere || isLeaf)
    if (isGroupNode) ids.add(orgId)

    // Children get frontier when we drill deeper or when parent is level-1 pass-through
    const childrenFrontier =
      org.level === 1 || (isFrontier && org.level >= 2 && !useThisHere && !isLeaf)
    children.forEach(c => traverse(c.id, childrenFrontier))
  }

  getRootOrgs(orgs).forEach(r => traverse(r.id, true))
  return ids
}

// Walk up from orgId until reaching a group node.
export function findGroupNodeId(
  orgId: string,
  groupNodeIds: Set<string>,
  idToOrg: Map<string, Organization>,
): string | undefined {
  let cur: Organization | undefined = idToOrg.get(orgId)
  while (cur) {
    if (groupNodeIds.has(cur.id)) return cur.id
    cur = cur.parentId ? idToOrg.get(cur.parentId) : undefined
  }
  return undefined
}

// Count rows per group node
export function computeRowCountByGroupId(
  groupNodeIds: Set<string>,
  orgs: Organization[],
  allocationList: AllocationRow[],
): Map<string, number> {
  const codeToOrg = new Map(orgs.filter(o => o.externalCode).map(o => [o.externalCode!, o]))
  const idToOrg   = new Map(orgs.map(o => [o.id, o]))
  const counts    = new Map<string, number>()

  for (const row of allocationList) {
    if (!row.prevDepartmentCode) continue
    const org = codeToOrg.get(row.prevDepartmentCode)
    if (!org) continue
    const gid = findGroupNodeId(org.id, groupNodeIds, idToOrg)
    if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1)
  }
  return counts
}

// Build rowId → assignee map for BulkSetAssigneeOperation
export function buildRowAssignments(
  groupNodeIds: Set<string>,
  orgAssignees: Map<string, string>,
  orgs: Organization[],
  allocationList: AllocationRow[],
): Map<number, string> {
  const codeToOrg = new Map(orgs.filter(o => o.externalCode).map(o => [o.externalCode!, o]))
  const idToOrg   = new Map(orgs.map(o => [o.id, o]))
  const result    = new Map<number, string>()

  for (const row of allocationList) {
    if (!row.prevDepartmentCode) continue
    const org = codeToOrg.get(row.prevDepartmentCode)
    if (!org) continue
    const gid = findGroupNodeId(org.id, groupNodeIds, idToOrg)
    if (!gid) continue
    const assignee = orgAssignees.get(gid) ?? idToOrg.get(gid)?.name ?? ''
    if (assignee) result.set(row.rowId, assignee)
  }
  return result
}
