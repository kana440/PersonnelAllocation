import { useState, useMemo } from 'react'
import { useScopedStore } from '../../store/useScopedStore'
import { buildOrgMap } from '@personnel/domain/choices/rows'
import { bindOperation } from '@personnel/domain/commands/defs'
import { orgRestructureDef } from '@personnel/domain/commands/defs/orgTransferDefs'
import { TR } from '@personnel/domain/transferReasonLabels'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { appService } from '../../application/HRApplicationService'
import { OrgPickerModal } from '../common/OrgPickerModal'

interface OrgGroup {
  prevCode: string
  orgName:  string
  rows:     AllocationRow[]
}

export function UnmappedOrgSection() {
  const { allocationList, afterOrganizations, beforeOrganizations, persons } = useScopedStore()

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor]           = useState<OrgGroup | null>(null)
  const [collapsed, setCollapsed]           = useState(false)

  const afterOrgCodes = useMemo(
    () => new Set(afterOrganizations.filter(o => o.externalCode).map(o => o.externalCode!)),
    [afterOrganizations],
  )

  const beforeOrgByCode = useMemo(
    () => buildOrgMap(beforeOrganizations),
    [beforeOrganizations],
  )

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  const groups = useMemo((): OrgGroup[] => {
    const unresolved = allocationList.filter(row => {
      const code = row.departmentCode as string | undefined
      return !code || !afterOrgCodes.has(code)
    })

    const byPrevCode = new Map<string, AllocationRow[]>()
    for (const row of unresolved) {
      const prevCode = (row.prevDepartmentCode as string | undefined) ?? ''
      const arr = byPrevCode.get(prevCode) ?? []
      arr.push(row)
      byPrevCode.set(prevCode, arr)
    }

    return [...byPrevCode.entries()]
      .map(([prevCode, rows]) => {
        const org = prevCode ? beforeOrgByCode.get(prevCode) : undefined
        return {
          prevCode,
          orgName: org?.name ?? (prevCode ? `（不明 ${prevCode}）` : '（旧組織未設定）'),
          rows,
        }
      })
      .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ja'))
  }, [allocationList, afterOrgCodes, beforeOrgByCode])

  const totalCount = groups.reduce((acc, g) => acc + g.rows.length, 0)

  if (totalCount === 0) return null

  const toggleGroup = (prevCode: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(prevCode) ? next.delete(prevCode) : next.add(prevCode)
      return next
    })

  const handleAssign = (group: OrgGroup, targetOrgId: string) => {
    const targetOrg  = afterOrganizations.find(o => o.id === targetOrgId)
    const targetCode = targetOrg?.externalCode
    if (!targetCode) return

    const commands = group.rows.map(row =>
      bindOperation(orgRestructureDef, row.rowId, {
        departmentCode: targetCode,
        transferReason: TR.DIV_TRANSFER_RESTRUCTURE,
        location:   row.location   as string | undefined,
        costCenter: row.costCenter as string | undefined,
      })
    )
    appService.executeBatch(
      `組改一括割当: 旧 ${group.orgName} → ${targetOrg?.name ?? targetCode}`,
      commands,
    )
    setPickerFor(null)
  }

  return (
    <>
      <div className="border border-dashed border-orange-200 rounded">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-t transition-colors"
        >
          <span>旧組織（未割当）</span>
          <span className="flex items-center gap-1.5">
            <span className="font-normal text-orange-500">{totalCount}名</span>
            <span className="text-orange-400">{collapsed ? '▸' : '▾'}</span>
          </span>
        </button>

        {!collapsed && (
          <div className="px-1 py-0.5 space-y-0.5">
            {groups.map(group => {
              const key        = group.prevCode || '__unset__'
              const isExpanded = expandedGroups.has(key)
              return (
                <div key={key}>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => toggleGroup(key)}
                      className="flex-1 flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-orange-50 text-xs text-gray-700 transition-colors min-w-0"
                    >
                      <span className="text-gray-400 flex-shrink-0 text-[10px]">{isExpanded ? '▾' : '▸'}</span>
                      <span className="truncate flex-1">{group.orgName}</span>
                      <span className="ml-1 text-gray-400 flex-shrink-0">{group.rows.length}名</span>
                    </button>
                    <button
                      onClick={() => setPickerFor(group)}
                      className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors whitespace-nowrap"
                      title="新組織コードに一括割り当て"
                    >→ 割当</button>
                  </div>

                  {isExpanded && (
                    <div className="ml-4 border-l border-orange-100 pl-1.5">
                      {group.rows.map(row => {
                        const person = row.userId ? personBySfId.get(row.userId) : undefined
                        const name   = person?.name
                          ?? ([row.lastName, row.firstName].filter(Boolean).join(' ') || undefined)
                          ?? '（空席）'
                        return (
                          <div key={row.rowId} className="text-xs text-gray-500 py-0.5 truncate">
                            {name}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pickerFor && (
        <OrgPickerModal
          open
          title={`旧「${pickerFor.orgName}」${pickerFor.rows.length}名を新組織に割り当て`}
          onClose={() => setPickerFor(null)}
          onSelect={orgId => handleAssign(pickerFor, orgId)}
        />
      )}
    </>
  )
}
