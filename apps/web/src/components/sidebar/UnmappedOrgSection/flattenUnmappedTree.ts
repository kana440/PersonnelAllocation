import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person }        from '@personnel/domain/schemas'
import type { TreeNode }      from './OrgTreeNode'

export type FlatUnmappedRow =
  | {
      kind:             'org'
      orgId:            string
      orgName:          string
      depth:            number
      expanded:         boolean
      hasDirectMembers: boolean
      subtreeCount:     number
      directRowIds:     number[]
      directRows:       AllocationRow[]
    }
  | {
      kind:  'person'
      row:   AllocationRow
      name:  string
      depth: number
      orgId: string
    }

export function resolvePersonName(row: AllocationRow, personBySfId: Map<string, Person>): string {
  const p = row.userId ? personBySfId.get(row.userId) : undefined
  return p?.name ?? ([row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）')
}

export function flattenUnmappedTree(
  nodes:          TreeNode[],
  expandedOrgIds: Set<string>,
  personBySfId:   Map<string, Person>,
  depth =         0,
): FlatUnmappedRow[] {
  const result: FlatUnmappedRow[] = []
  for (const node of nodes) {
    const expanded = expandedOrgIds.has(node.orgId)
    result.push({
      kind:             'org',
      orgId:            node.orgId,
      orgName:          node.orgName,
      depth,
      expanded,
      hasDirectMembers: node.directRows.length > 0,
      subtreeCount:     node.subtreeCount,
      directRowIds:     node.directRows.map(r => r.rowId),
      directRows:       node.directRows,
    })
    if (expanded) {
      for (const row of node.directRows) {
        result.push({
          kind:  'person',
          row,
          name:  resolvePersonName(row, personBySfId),
          depth: depth + 1,
          orgId: node.orgId,
        })
      }
      result.push(...flattenUnmappedTree(node.children, expandedOrgIds, personBySfId, depth + 1))
    }
  }
  return result
}
