import { useMemo }              from 'react'
import { useStore }              from '../../../store/useStore'
import { buildOrgMap }           from '../../../domain/choices/rows'
import { getDescendantOrgIds }   from '../../../domain/choices/orgTree'
import type { Person }           from '../../../domain/schemas'
import type { AllocationRow }    from '../../../domain/allocationRow'
import type { Organization }     from '../../../domain/schemas'

export interface MemberInfo {
  row:      AllocationRow
  person:   Person
  isDirect: boolean
  subOrgId: string
}

export function useStripCardData(orgId: string) {
  const { allocationList, afterOrganizations, persons } = useStore()

  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations],
  )
  const orgByCode = useMemo(() => buildOrgMap(afterOrganizations), [afterOrganizations])
  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  // 親→子の Map（BFS・サブツリー計算を O(subtree) にする）
  const childrenOf = useMemo((): Map<string, Organization[]> => {
    const map = new Map<string, Organization[]>()
    for (const o of afterOrganizations) {
      if (!o.parentId || o.isAbandoned) continue
      const arr = map.get(o.parentId)
      if (arr) arr.push(o)
      else map.set(o.parentId, [o])
    }
    return map
  }, [afterOrganizations])

  const org = orgById.get(orgId)

  const descendantOrgIds = useMemo(
    () => getDescendantOrgIds(orgId, afterOrganizations),
    [orgId, afterOrganizations],
  )

  const allMembers = useMemo((): MemberInfo[] => {
    if (!org) return []
    return allocationList.flatMap(r => {
      if (!r.userId || !r.departmentCode) return []
      const rowOrg = orgByCode.get(r.departmentCode)
      if (!rowOrg || !descendantOrgIds.has(rowOrg.id)) return []
      const person = personBySfId.get(r.userId)
      if (!person) return []
      return [{ row: r, person, isDirect: rowOrg.id === orgId, subOrgId: rowOrg.id }]
    })
  }, [allocationList, orgByCode, descendantOrgIds, orgId, personBySfId, org])

  // childrenOf を使って O(subtree) で再帰合算
  const subtreeCountByOrg = useMemo(() => {
    const direct = new Map<string, number>()
    for (const m of allMembers) {
      direct.set(m.subOrgId, (direct.get(m.subOrgId) ?? 0) + 1)
    }
    const cache = new Map<string, number>()
    const calc  = (id: string): number => {
      if (cache.has(id)) return cache.get(id)!
      const t = (direct.get(id) ?? 0)
        + (childrenOf.get(id) ?? []).reduce((s, c) => s + calc(c.id), 0)
      cache.set(id, t)
      return t
    }
    for (const id of descendantOrgIds) calc(id)
    return cache
  }, [allMembers, childrenOf, descendantOrgIds])

  const directCount = useMemo(() => allMembers.filter(m => m.isDirect).length, [allMembers])

  return {
    org, orgById, childrenOf, allMembers,
    directCount, totalCount: allMembers.length, subtreeCountByOrg,
  }
}
