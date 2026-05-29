import { useMemo } from 'react'
import { buildOrgMap } from '../../../domain/projection/rows'
import type { Organization, Person } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { PositionEntry, MemberEntry } from '../OrgViewContext'
import { buildPositionContext } from '../../../application/positionPatterns'
import type { PositionContext } from '../../../application/positionPatterns'

interface UseOrgViewDataDeps {
  allAfterOrgs:   Organization[]
  persons:        Person[]
  allocationList: AllocationRow[]
}

export function useOrgViewData({ allAfterOrgs, persons, allocationList }: UseOrgViewDataDeps) {
  const afterOrgByCode = useMemo(() => buildOrgMap(allAfterOrgs), [allAfterOrgs])
  const personBySfId   = useMemo(() => new Map(persons.map(p => [p.sfPersonId ?? '', p])), [persons])

  const afterMembersByOrgId = useMemo(() => {
    const map = new Map<string, MemberEntry[]>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      const org    = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const arr = map.get(org.id)
      if (arr) arr.push({ row, person })
      else map.set(org.id, [{ row, person }])
    }
    return map
  }, [allocationList, afterOrgByCode, personBySfId])

  const afterOrgRowsById = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      const org = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const arr = map.get(org.id)
      if (arr) arr.push(row)
      else map.set(org.id, [row])
    }
    return map
  }, [allocationList, afterOrgByCode])

  const positionTreeByOrgId = useMemo((): Map<string, PositionEntry[]> => {
    const result = new Map<string, PositionEntry[]>()
    for (const [orgId, rows] of afterOrgRowsById) {
      const childrenByMgrCode = new Map<string, AllocationRow[]>()
      const inOrgPosCodes     = new Set<string>()
      for (const row of rows) {
        if (row.positionCode) inOrgPosCodes.add(row.positionCode)
        if (row.managerPositionCode) {
          const arr = childrenByMgrCode.get(row.managerPositionCode)
          if (arr) arr.push(row)
          else childrenByMgrCode.set(row.managerPositionCode, [row])
        }
      }
      const rootRows = rows.filter(r => !r.managerPositionCode || !inOrgPosCodes.has(r.managerPositionCode))
      const entries: PositionEntry[] = []
      const visited = new Set<number>()
      const visit = (row: AllocationRow, depth: number) => {
        if (visited.has(row.rowId)) return
        visited.add(row.rowId)
        entries.push({ row, person: row.userId ? (personBySfId.get(row.userId) ?? null) : null, depth })
        if (row.positionCode) {
          const children = childrenByMgrCode.get(row.positionCode) ?? []
          for (const c of children) if (c.rowId !== row.rowId) visit(c, depth + 1)
        }
      }
      rootRows.forEach(r => visit(r, 0))
      for (const row of rows) {
        if (!visited.has(row.rowId)) entries.push({ row, person: row.userId ? (personBySfId.get(row.userId) ?? null) : null, depth: 0 })
      }
      result.set(orgId, entries)
    }
    return result
  }, [afterOrgRowsById, personBySfId])

  const positionContext = useMemo<PositionContext>(
    () => buildPositionContext(allocationList),
    [allocationList],
  )

  return { afterOrgByCode, personBySfId, afterMembersByOrgId, positionTreeByOrgId, positionContext }
}
