import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { buildOrgMap } from '@personnel/domain/rules/options/rows'
import { buildOrgPath } from '@personnel/domain/rules/options/relevantOrgs'

export interface UnassignedGroup {
  groupKey:    string
  code:        string | null
  orgName:     string | null
  orgPath:     string | null
  /** テキストフィールド（businessUnit › division › ...）から構築したパス */
  textPath:    string | null
  /** true = departmentCodeあり but afterOrg に対応なし */
  isMismatch:  boolean
  rowIds:      number[]
  names:       string[]
}

function joinPath(parts: (string | undefined)[]): string | null {
  const filtered = parts.filter(Boolean) as string[]
  return filtered.length > 0 ? filtered.join(' › ') : null
}

export function useUnassignedRows(): UnassignedGroup[] {
  const { allocationList, beforeOrganizations, afterOrganizations, persons } = useStore()

  return useMemo(() => {
    const beforeOrgById   = new Map(beforeOrganizations.map(o => [o.id, o]))
    const beforeOrgByCode = buildOrgMap(beforeOrganizations)
    const afterOrgByCode  = buildOrgMap(afterOrganizations)
    const personBySfId    = new Map(persons.map(p => [p.sfPersonId ?? '', p]))

    type GroupData = {
      rowIds:   number[]
      names:    string[]
      firstRow: typeof allocationList[0] | undefined
    }

    const noCodeGroups   = new Map<string | null, GroupData>()
    const mismatchGroups = new Map<string, GroupData>()

    for (const r of allocationList) {
      if (!r.userId) continue
      const person = personBySfId.get(r.userId)
      const name   = person ? person.name : `rowId:${r.rowId}`

      if (!r.departmentCode) {
        // departmentCode なし（新入社員など旧組織なし含む）
        const key      = r.prevDepartmentCode ?? null
        const existing = noCodeGroups.get(key)
        if (existing) {
          existing.rowIds.push(r.rowId)
          existing.names.push(name)
        } else {
          noCodeGroups.set(key, { rowIds: [r.rowId], names: [name], firstRow: r })
        }
      } else if (!afterOrgByCode.has(r.departmentCode)) {
        // departmentCode あり but afterOrg に対応なし
        const key      = r.departmentCode
        const existing = mismatchGroups.get(key)
        if (existing) {
          existing.rowIds.push(r.rowId)
          existing.names.push(name)
        } else {
          mismatchGroups.set(key, { rowIds: [r.rowId], names: [name], firstRow: r })
        }
      }
    }

    const result: UnassignedGroup[] = []

    // ── departmentCode なし グループ ─────────────────────────────
    for (const [prevCode, { rowIds, names, firstRow }] of noCodeGroups) {
      let orgName: string | null = null
      let orgPath: string | null = null
      if (prevCode) {
        const org = beforeOrgByCode.get(prevCode)
        if (org) {
          orgName = org.name
          orgPath = buildOrgPath(org.id, beforeOrgById)
        } else {
          orgName = prevCode
        }
      }
      const textPath = firstRow
        ? joinPath([firstRow.prevBusinessUnit, firstRow.prevDivision, firstRow.prevSubDivision, firstRow.prevGroup, firstRow.prevTeam])
        : null
      result.push({
        groupKey:   `prev:${prevCode ?? '__new__'}`,
        code:       prevCode,
        orgName,
        orgPath,
        textPath,
        isMismatch: false,
        rowIds,
        names,
      })
    }

    // ── departmentCode 不一致グループ ────────────────────────────
    for (const [code, { rowIds, names, firstRow }] of mismatchGroups) {
      // beforeOrganizations にも存在するか確認（旧コードのまま残っているケース）
      const beforeOrg = beforeOrgByCode.get(code)
      const orgName   = beforeOrg?.name ?? null
      const orgPath   = beforeOrg ? buildOrgPath(beforeOrg.id, beforeOrgById) : null
      const textPath  = firstRow
        ? joinPath([firstRow.businessUnit, firstRow.division, firstRow.subDivision, firstRow.group, firstRow.team])
        : null
      result.push({
        groupKey:   `mismatch:${code}`,
        code,
        orgName,
        orgPath,
        textPath,
        isMismatch: true,
        rowIds,
        names,
      })
    }

    result.sort((a, b) => {
      if (a.code === null && b.code !== null) return 1
      if (a.code !== null && b.code === null) return -1
      const aLabel = a.orgName ?? a.code ?? ''
      const bLabel = b.orgName ?? b.code ?? ''
      return aLabel.localeCompare(bLabel, 'ja')
    })

    return result
  }, [allocationList, beforeOrganizations, afterOrganizations, persons])
}
