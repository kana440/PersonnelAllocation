import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'

export type FlatTreeRow =
  | { kind: 'company'; companyId: string; isOpen: boolean }
  | {
      kind:         'org'
      org:          Organization
      depth:        number
      hasChildren:  boolean
      isExpanded:   boolean
      subtreeCount: number
    }
  | {
      kind:   'person'
      row:    AllocationRow
      person: Person | null   // null = 空席ポジション
      orgId:  string
      depth:  number
    }

export function flattenOrgTree(params: {
  viewOrgs:            Organization[]
  expandedOrgIds:      Set<string>
  closedCompanies:     Set<string>
  membersByOrgId:      Map<string, Array<{ row: AllocationRow; person: Person | null }>>
  subtreeCountByOrgId: Map<string, number>
  showVacantPositions: boolean
}): FlatTreeRow[] {
  const {
    viewOrgs, expandedOrgIds, closedCompanies,
    membersByOrgId, subtreeCountByOrgId, showVacantPositions,
  } = params

  // O(N) で子マップ構築
  const viewOrgIds = new Set(viewOrgs.map(o => o.id))
  const childrenOf = new Map<string, Organization[]>()
  for (const o of viewOrgs) {
    if (o.parentId && viewOrgIds.has(o.parentId)) {
      const list = childrenOf.get(o.parentId) ?? []
      list.push(o)
      childrenOf.set(o.parentId, list)
    }
  }

  const rows: FlatTreeRow[] = []
  const companies = [...new Set(viewOrgs.map(o => o.companyId))].filter(Boolean) as string[]

  for (const companyId of companies) {
    const rootOrgs = viewOrgs.filter(
      o => o.companyId === companyId && (!o.parentId || !viewOrgIds.has(o.parentId))
    )
    if (rootOrgs.length === 0) continue

    const isOpen = !closedCompanies.has(companyId)
    rows.push({ kind: 'company', companyId, isOpen })
    if (!isOpen) continue

    for (const org of rootOrgs) append(org, 0)
  }

  function append(org: Organization, depth: number) {
    const children     = childrenOf.get(org.id) ?? []
    const members      = membersByOrgId.get(org.id) ?? []
    const isExpanded   = expandedOrgIds.has(org.id)
    const hasChildren  = children.length > 0 || members.length > 0
    const subtreeCount = subtreeCountByOrgId.get(org.id) ?? 0

    rows.push({ kind: 'org', org, depth, hasChildren, isExpanded, subtreeCount })

    if (!isExpanded) return

    for (const { row, person } of members) {
      if (person === null && !showVacantPositions) continue
      rows.push({ kind: 'person', row, person, orgId: org.id, depth })
    }

    for (const child of children) append(child, depth + 1)
  }

  return rows
}
