import { useMemo } from 'react'
import { useScopedStore } from '../../../store/useScopedStore'
import { buildOrgMap } from '@personnel/domain/rules/options/rows'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'

export function useSidebarMemberData() {
  const { allocationList, organizations: beforeOrgs, persons, afterOrganizations } = useScopedStore()

  const viewOrgs = useMemo(
    () => afterOrganizations.filter(o => !o.isAbandoned),
    [afterOrganizations],
  )

  const afterOrgByCode  = useMemo(() => buildOrgMap(afterOrganizations), [afterOrganizations])
const personBySfId    = useMemo(() => new Map(persons.map(p => [p.sfPersonId ?? '', p])), [persons])

  const afterMembersByOrgId = useMemo(() => {
    const map = new Map<string, Array<{ row: AllocationRow; person: Person | null }>>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      const org = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '') ?? null
      // positionCode も userId もない行（未アサインメンバー）は除外
      if (!person && !row.positionCode) continue
      const arr = map.get(org.id)
      if (arr) arr.push({ row, person })
      else map.set(org.id, [{ row, person }])
    }
    return map
  }, [allocationList, afterOrgByCode, personBySfId])

  const assignedPersonIds = useMemo(() => {
    const ids = new Set<string>()
    for (const members of afterMembersByOrgId.values())
      for (const { person } of members) if (person) ids.add(person.id)
    return ids
  }, [afterMembersByOrgId])

  const subtreeCountByOrgId = useMemo(() => {
    const childrenByParent = new Map<string, Organization[]>()
    for (const org of viewOrgs) {
      if (org.parentId) {
        const arr = childrenByParent.get(org.parentId) ?? []
        arr.push(org)
        childrenByParent.set(org.parentId, arr)
      }
    }
    // カウントは在席者のみ（空席ポジションは含めない）
    const count = (orgId: string): number => {
      const direct   = (afterMembersByOrgId.get(orgId) ?? []).filter(m => m.person !== null).length
      const children = childrenByParent.get(orgId) ?? []
      return direct + children.reduce((sum, c) => sum + count(c.id), 0)
    }
    const map = new Map<string, number>()
    for (const org of viewOrgs) map.set(org.id, count(org.id))
    return map
  }, [viewOrgs, afterMembersByOrgId])

  return {
    viewOrgs, afterOrgByCode, afterMembersByOrgId, assignedPersonIds,
    subtreeCountByOrgId, persons, allocationList, beforeOrgs,
  }
}
