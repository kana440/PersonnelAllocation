import { delay } from './delay'
import type { PersonDiff } from '../../../application/aiTypes'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { Organization } from '../../../domain/schemas'

// Collect all org IDs within a subtree (the org itself + all descendants)
function collectSubtreeOrgIds(orgId: string, allOrgs: Organization[]): Set<string> {
  const ids = new Set<string>([orgId])
  const queue = [orgId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const o of allOrgs) {
      if (o.parentId === current && !ids.has(o.id)) {
        ids.add(o.id)
        queue.push(o.id)
      }
    }
  }
  return ids
}

// Collect the external codes (departmentCode) of all orgs in the subtree
function subtreeOrgCodes(rootOrg: Organization, allOrgs: Organization[]): Set<string> {
  const ids = collectSubtreeOrgIds(rootOrg.id, allOrgs)
  const codes = new Set<string>()
  for (const o of allOrgs) {
    if (ids.has(o.id)) {
      codes.add(o.externalCode ?? o.id)
    }
  }
  return codes
}

export function buildImpactGroups(
  rootOrg: Organization,
  allOrgs: Organization[],
  allRows: AllocationRow[],
): Array<{ orgName: string; persons: PersonDiff[] }> {
  const ownCodes = subtreeOrgCodes(rootOrg, allOrgs)

  // Changed rows = those with an operationGroupId
  const changedRows = allRows.filter(r => r.operationGroupId)

  // Filter to rows in orgs OUTSIDE the user's subtree
  const outsideRows = changedRows.filter(
    r => !ownCodes.has(r.prevDepartmentCode ?? '') && !ownCodes.has(r.departmentCode ?? '')
  )

  // Group by org name
  const byOrg = new Map<string, PersonDiff[]>()
  for (const row of outsideRows) {
    const orgName = allOrgs.find(
      o => (o.externalCode ?? o.id) === (row.departmentCode ?? row.prevDepartmentCode)
    )?.name ?? (row.departmentCode ?? row.prevDepartmentCode ?? '不明')

    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || ''
    const diff: PersonDiff = {
      userId:  row.userId ?? '',
      name,
      orgName,
      rowId:   row.rowId,
      before: {
        grade:    row.prevPayGrade,
        position: row.prevOfficialPositionCode,
        orgName:  allOrgs.find(o => (o.externalCode ?? o.id) === row.prevDepartmentCode)?.name,
      },
      after: {
        grade:    row.payGrade,
        position: row.officialPositionCode,
        orgName:  allOrgs.find(o => (o.externalCode ?? o.id) === row.departmentCode)?.name,
      },
    }
    const group = byOrg.get(orgName) ?? []
    group.push(diff)
    byOrg.set(orgName, group)
  }

  return Array.from(byOrg.entries()).map(([orgName, persons]) => ({ orgName, persons }))
}

export const checkImpactScenario = {
  async promptMessage(): Promise<string> {
    await delay(600)
    return '担当されている部門名を教えてください。その部門以外に意図しない変更がないか確認します。'
  },

  async scanMessage(
    inputName: string,
    org: Organization | null,
    groups: Array<{ orgName: string; persons: PersonDiff[] }>,
  ): Promise<
    | { text: string; targetOrgName: string; hasImpact: boolean; groups: typeof groups }
    | { text: string }
  > {
    await delay(1500)
    if (!org) {
      return { text: `「${inputName}」に一致する部門が見つかりませんでした。別の名前で試してください。` }
    }
    const hasImpact = groups.length > 0
    const text = hasImpact
      ? `${groups.reduce((s, g) => s + g.persons.length, 0)} 件の担当外変更が検出されました。内容を確認してください。`
      : `担当外組織への変更は検出されませんでした。`
    return { text, targetOrgName: org.name, hasImpact, groups }
  },
}
