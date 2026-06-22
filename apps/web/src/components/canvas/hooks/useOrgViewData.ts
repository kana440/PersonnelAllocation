import { useMemo } from 'react'
import { buildOrgMap } from '@personnel/domain/choices/rows'
import type { Organization, Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { PositionEntry, MemberEntry } from '../OrgViewContext'
import { detectPatterns } from '@personnel/domain/patterns/detection'
import { buildPositionDepthList } from '../panel/helpers'

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
      const depthList = buildPositionDepthList(rows, r => r.positionCode, r => r.managerPositionCode)
      result.set(orgId, depthList.map(({ row, depth }) => ({
        row,
        depth,
        person:         row.userId ? (personBySfId.get(row.userId) ?? null) : null,
        activePatterns: detectPatterns(row).patterns,
      })))
    }
    return result
  }, [afterOrgRowsById, personBySfId])

  return { afterOrgByCode, personBySfId, afterMembersByOrgId, positionTreeByOrgId }
}
