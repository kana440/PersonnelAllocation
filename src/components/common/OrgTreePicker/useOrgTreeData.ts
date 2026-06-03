import { useMemo }           from 'react'
import type { Organization }  from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'
import { buildOrgMap }        from '../../../domain/choices/rows'

export interface OrgTreeData {
  active:       Organization[]
  orgById:      Map<string, Organization>
  activeIds:    Set<string>
  childrenOf:   Map<string | null, Organization[]>
  directCount:  Map<string, number>
  totalCount:   Map<string, number>
  roots:        Organization[]
}

export function useOrgTreeData(allOrgs: Organization[], allocationList: AllocationRow[]): OrgTreeData {
  const active    = useMemo(() => allOrgs.filter(o => !o.isAbandoned), [allOrgs])
  const orgById   = useMemo(() => new Map(active.map(o => [o.id, o])), [active])
  const activeIds = useMemo(() => new Set(active.map(o => o.id)), [active])

  const childrenOf = useMemo((): Map<string | null, Organization[]> => {
    const map = new Map<string | null, Organization[]>()
    for (const o of active) {
      const p = (o.parentId && activeIds.has(o.parentId)) ? o.parentId : null
      const arr = map.get(p)
      if (arr) arr.push(o)
      else map.set(p, [o])
    }
    return map
  }, [active, activeIds])

  const orgByCode   = useMemo(() => buildOrgMap(active), [active])
  const directCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of allocationList) {
      if (!r.departmentCode || !r.userId) continue
      const o = orgByCode.get(r.departmentCode)
      if (o) m.set(o.id, (m.get(o.id) ?? 0) + 1)
    }
    return m
  }, [allocationList, orgByCode])

  const totalCount = useMemo(() => {
    const cache = new Map<string, number>()
    const calc  = (id: string): number => {
      if (cache.has(id)) return cache.get(id)!
      const t = (directCount.get(id) ?? 0)
        + (childrenOf.get(id) ?? []).reduce((s, c) => s + calc(c.id), 0)
      cache.set(id, t)
      return t
    }
    for (const o of active) calc(o.id)
    return cache
  }, [active, directCount, childrenOf])

  const roots = useMemo(() => childrenOf.get(null) ?? [], [childrenOf])

  return { active, orgById, activeIds, childrenOf, directCount, totalCount, roots }
}
