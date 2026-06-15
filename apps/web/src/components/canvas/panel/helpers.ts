import type { Organization } from '@personnel/domain/schemas'
import type { PositionEntry } from '../OrgViewContext'

export function subtreeRowCount(
  orgId: string,
  organizations: Organization[],
  positionTreeByOrgId: Map<string, PositionEntry[]>,
): number {
  const direct   = positionTreeByOrgId.get(orgId)?.length ?? 0
  const children = organizations.filter(o => o.parentId === orgId)
  return direct + children.reduce((sum, c) => sum + subtreeRowCount(c.id, organizations, positionTreeByOrgId), 0)
}

/** org または子孫のどこかに行があるかを判定 */
export function hasAnyRows(
  orgId: string,
  organizations: Organization[],
  positionTreeByOrgId: Map<string, PositionEntry[]>,
): boolean {
  if (positionTreeByOrgId.has(orgId)) return true
  return organizations
    .filter(o => o.parentId === orgId)
    .some(c => hasAnyRows(c.id, organizations, positionTreeByOrgId))
}
