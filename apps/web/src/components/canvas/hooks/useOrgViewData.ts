import { useMemo } from 'react'
import { buildOrgMap } from '@personnel/domain/choices/rows'
import type { Organization, Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { PositionEntry, MemberEntry } from '../OrgViewContext'
import { detectPatterns } from '@personnel/domain/patterns/detection'
import { buildPositionDepthList } from '../panel/helpers'

interface UseOrgViewDataDeps {
  allAfterOrgs:   Organization[]
  persons:        Person[]
  allocationList: AllocationRow[]
  masters:        AllMasters
}

/**
 * パネル内カードの表示順: positionBand の高さ降順 → 氏名の五十音順。
 * バンドの高さは masters.jobLevels の promotionDemotionWarningLevel で判定する。
 * 漢字氏名は Intl.Collator('ja') でベストエフォートのソート（フリガナ未対応）。
 */
function makeRowComparator(masters: AllMasters): (a: AllocationRow, b: AllocationRow) => number {
  const collator = new Intl.Collator('ja')
  const levelOf  = (row: AllocationRow): number => {
    const band = row.positionBand as string | undefined
    return masters.jobLevels.find(e => e.label === band)?.promotionDemotionWarningLevel ?? -1
  }
  return (a, b) => {
    const diff = levelOf(b) - levelOf(a)  // 降順（高バンド先頭）
    if (diff !== 0) return diff
    const nameA = [(a.lastName ?? ''), (a.firstName ?? '')].join('')
    const nameB = [(b.lastName ?? ''), (b.firstName ?? '')].join('')
    return collator.compare(nameA, nameB)
  }
}

export function useOrgViewData({ allAfterOrgs, persons, allocationList, masters }: UseOrgViewDataDeps) {
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

  const rowComparator = useMemo(() => makeRowComparator(masters), [masters])

  const positionTreeByOrgId = useMemo((): Map<string, PositionEntry[]> => {
    const result = new Map<string, PositionEntry[]>()
    for (const [orgId, rows] of afterOrgRowsById) {
      // 同一階層内をバンド降順→氏名五十音順でソートしてから深さリストを構築
      const sortedRows = [...rows].sort(rowComparator)
      const depthList  = buildPositionDepthList(sortedRows, r => r.positionCode, r => r.managerPositionCode)
      result.set(orgId, depthList.map(({ row, depth }) => ({
        row,
        depth,
        person:         row.userId ? (personBySfId.get(row.userId) ?? null) : null,
        activePatterns: detectPatterns(row).patterns,
      })))
    }
    return result
  }, [afterOrgRowsById, personBySfId, rowComparator])

  return { afterOrgByCode, personBySfId, afterMembersByOrgId, positionTreeByOrgId }
}
