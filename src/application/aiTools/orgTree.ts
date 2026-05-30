import type { Organization } from '../../domain/schemas'
import type { OrgTreeNode, PersonInfo } from '../aiTypes'
import type { PersonSearchResult } from './types'

/** 組織ツリーを再帰的に構築する純粋関数。 */
export function buildOrgTree(
  org:     Organization,
  allOrgs: Organization[],
  persons: PersonSearchResult[],
): OrgTreeNode {
  const orgCode = org.externalCode ?? org.id
  const members: PersonInfo[] = persons
    .filter(p => p.orgCode === orgCode)
    .map(p => ({ userId: p.userId, name: p.name, orgName: org.name, rowIds: p.rowIds }))
  const children = allOrgs
    .filter(o => o.parentId === org.id)
    .map(c => buildOrgTree(c, allOrgs, persons))
  return { orgId: org.id, orgName: org.name, orgCode, members, children }
}
