import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { buildOrgPath } from '../../../domain/orgPicker/relevantOrgs'

export interface UnassignedGroup {
  /** prevDepartmentCode（旧所属コード）。null = 新入社員など旧組織なし */
  prevCode:    string | null
  prevOrgName: string | null
  prevOrgPath: string | null
  rowIds:      number[]
  names:       string[]
}

export function useUnassignedRows(): UnassignedGroup[] {
  const { allocationList, beforeOrganizations, persons } = useStore()

  return useMemo(() => {
    const beforeOrgById = new Map(beforeOrganizations.map(o => [o.id, o]))
    const beforeOrgByCode = new Map(
      beforeOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o]),
    )
    const personBySfId = new Map(persons.map(p => [p.sfPersonId ?? '', p]))

    // 未設定 = userId あり & departmentCode なし (退職行 = userId なし は自然に除外)
    const unassigned = allocationList.filter(
      r => r.userId && !r.departmentCode,
    )

    const groups = new Map<string | null, { rowIds: number[]; names: string[] }>()

    for (const r of unassigned) {
      const key = r.prevDepartmentCode ?? null
      const person = personBySfId.get(r.userId ?? '')
      const name = person ? person.name : `rowId:${r.rowId}`
      const existing = groups.get(key)
      if (existing) {
        existing.rowIds.push(r.rowId)
        existing.names.push(name)
      } else {
        groups.set(key, { rowIds: [r.rowId], names: [name] })
      }
    }

    const result: UnassignedGroup[] = []
    for (const [prevCode, { rowIds, names }] of groups) {
      let prevOrgName: string | null = null
      let prevOrgPath: string | null = null
      if (prevCode) {
        const org = beforeOrgByCode.get(prevCode)
        if (org) {
          prevOrgName = org.name
          prevOrgPath = buildOrgPath(org.id, beforeOrgById)
        } else {
          prevOrgName = prevCode  // コードのみ表示
        }
      }
      result.push({ prevCode, prevOrgName, prevOrgPath, rowIds, names })
    }

    // 旧組織あり → 先、旧組織なし → 末尾
    result.sort((a, b) => {
      if (a.prevCode === null && b.prevCode !== null) return 1
      if (a.prevCode !== null && b.prevCode === null) return -1
      return (a.prevOrgName ?? '').localeCompare(b.prevOrgName ?? '', 'ja')
    })

    return result
  }, [allocationList, beforeOrganizations, persons])
}
