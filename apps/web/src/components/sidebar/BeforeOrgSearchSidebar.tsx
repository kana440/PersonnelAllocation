import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { useScopedStore } from '../../store/useScopedStore'
import { useOrgTreeState } from './hooks/useOrgTreeState'
import { OrgTreeNode, OrgNodeProvider } from './OrgTreeNode'
import { buildOrgMap } from '@personnel/domain/choices/rows'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'

function subtreeCount(
  orgId: string,
  childrenByParent: Map<string, Organization[]>,
  membersByOrgId: Map<string, Array<{ row: AllocationRow; person: Person }>>,
): number {
  const direct = membersByOrgId.get(orgId)?.length ?? 0
  const children = childrenByParent.get(orgId) ?? []
  return direct + children.reduce((acc, c) => acc + subtreeCount(c.id, childrenByParent, membersByOrgId), 0)
}

export function BeforeOrgSearchSidebar() {
  const {
    beforeOrganizations, afterOrganizations, persons,
    selectedCardRowId, selectedCardSource, selectCard,
  } = useStore()
  const { allocationList } = useScopedStore()
  const { comparisonPanels, setComparisonOrgOpen, requestScrollToBeforeRow } = useCanvasLayoutStore()

  const treeScrollRef = useRef<HTMLDivElement>(null)
  const [orgSearch, setOrgSearch] = useState('')

  // before-org ごとのメンバーマップ（prevDepartmentCode で紐付け）
  const { beforeMembersByOrgId, subtreeCountByOrgId } = useMemo(() => {
    const beforeOrgByCode = buildOrgMap(beforeOrganizations)
    const personBySfId = new Map(persons.map(p => [p.sfPersonId ?? '', p]))

    const membersByOrgId = new Map<string, Array<{ row: AllocationRow; person: Person }>>()
    for (const row of allocationList) {
      if (!row.userId || !row.prevDepartmentCode) continue
      const org = beforeOrgByCode.get(row.prevDepartmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId)
      if (!person) continue
      const arr = membersByOrgId.get(org.id)
      if (arr) arr.push({ row, person })
      else membersByOrgId.set(org.id, [{ row, person }])
    }

    const viewOrgs = beforeOrganizations.filter(o => !o.isAbandoned)
    const childrenByParent = new Map<string, Organization[]>()
    for (const o of viewOrgs) {
      if (o.parentId) {
        const arr = childrenByParent.get(o.parentId) ?? []
        arr.push(o)
        childrenByParent.set(o.parentId, arr)
      }
    }

    const subtreeCountByOrgId = new Map<string, number>()
    for (const o of viewOrgs) {
      subtreeCountByOrgId.set(o.id, subtreeCount(o.id, childrenByParent, membersByOrgId))
    }

    return { beforeMembersByOrgId: membersByOrgId, subtreeCountByOrgId }
  }, [beforeOrganizations, allocationList, persons])

  const viewOrgs = useMemo(() => beforeOrganizations.filter(o => !o.isAbandoned), [beforeOrganizations])
  const viewOrgIds = useMemo(() => new Set(viewOrgs.map(o => o.id)), [viewOrgs])

  const afterOrgExtCodes = useMemo(
    () => new Set(afterOrganizations.filter(o => o.externalCode).map(o => o.externalCode!)),
    [afterOrganizations],
  )

  const { closedCompanies, toggleCompany, expandedOrgIds, toggleOrg, expandToOrg } = useOrgTreeState(viewOrgs)

  const openComparisonPanel = (orgId: string) => {
    const panel = comparisonPanels.find(p => p.orgId === orgId)
    if (panel && !panel.open) setComparisonOrgOpen(orgId, true)
  }

  const handlePersonClick = (rowId: number, orgId: string) => {
    selectCard(rowId, 'before')
    openComparisonPanel(orgId)
    requestScrollToBeforeRow(rowId)
  }

  const handleOrgClick = (orgId: string) => {
    openComparisonPanel(orgId)
  }

  // 選択カード変更時にサイドバーツリーを展開（OrgSearchSidebar と同パターン）
  // source に関わらず展開・スクロール。hidden 要素へのスクロールは無害なので条件分岐しない
  useEffect(() => {
    if (!selectedCardRowId) return
    const row = allocationList.find(r => r.rowId === selectedCardRowId)
    if (!row?.prevDepartmentCode) return
    // viewOrgs（廃止除外）で検索: expandToOrg は viewOrgs にない id を無視するため
    const org = viewOrgs.find(o => o.externalCode === row.prevDepartmentCode)
    if (!org) return
    expandToOrg(org.id)
    const id = selectedCardRowId
    setTimeout(() => {
      treeScrollRef.current
        ?.querySelector(`[data-sidebar-rowid="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)
  }, [selectedCardRowId, selectedCardSource]) // eslint-disable-line react-hooks/exhaustive-deps

  const getOrgChangeStatus = (orgId: string): 'changed' | 'new' | 'removed' | null => {
    const org = beforeOrganizations.find(o => o.id === orgId)
    if (!org?.externalCode) return null
    return afterOrgExtCodes.has(org.externalCode) ? null : 'removed'
  }

  const orgSearchLower = orgSearch.toLowerCase().trim()
  const searchResults = orgSearchLower ? [
    ...viewOrgs
      .filter(o => o.name.toLowerCase().includes(orgSearchLower))
      .map(o => ({
        type: 'org' as const, id: o.id, label: o.name,
        sub: o.companyId ?? '', orgId: o.id, rowId: undefined as number | undefined,
      })),
    ...persons.flatMap(p => {
      if (!p.name.toLowerCase().includes(orgSearchLower)) return []
      const rows = allocationList.filter(r => r.userId === p.sfPersonId && !!r.prevDepartmentCode)
      return rows.map(row => {
        const org = beforeOrganizations.find(o => o.externalCode === row.prevDepartmentCode)
        return {
          type: 'person' as const, id: `${p.id}-${row.rowId}`, label: p.name,
          sub: org?.name ?? '所属なし', orgId: org?.id, rowId: row.rowId,
        }
      })
    }),
  ] : []

  const orgNodeCtx = {
    viewOrgs,
    afterMembersByOrgId: beforeMembersByOrgId,
    subtreeCountByOrgId,
    beforeOrgs: beforeOrganizations, // 同一リスト → isNewOrg = false（「新」バッジ非表示）
    expandedOrgIds,
    selectedCardRowId,
    showVacantPositions: false,
    toggleOrg,
    onOrgClick:          handleOrgClick,
    onPersonClick:       handlePersonClick,
    onPersonDoubleClick: () => {},
    onPersonContextMenu: () => {},
    onPersonDragStart:   () => {},
    hasPersonChanges:    () => false,
    getOrgChangeStatus,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 検索 */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1.5">
        <input
          type="text"
          value={orgSearch}
          onChange={e => setOrgSearch(e.target.value)}
          placeholder="🔍 組織・人名（旧）"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-400"
        />
      </div>

      {orgSearchLower ? (
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {searchResults.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-3">該当なし</div>
          )}
          {searchResults.map(r => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                if (r.rowId != null && r.orgId) {
                  handlePersonClick(r.rowId, r.orgId)
                } else if (r.orgId) {
                  handleOrgClick(r.orgId)
                  expandToOrg(r.orgId)
                }
                setOrgSearch('')
              }}
              className="w-full text-left flex items-center gap-1.5 px-1 py-1 rounded hover:bg-amber-50 transition-colors"
            >
              <span className="text-gray-400 text-xs flex-shrink-0">
                {r.type === 'org' ? '🏢' : '👤'}
              </span>
              <span className="text-xs font-medium text-gray-700 truncate flex-1">{r.label}</span>
              <span className="text-xs text-gray-400 truncate flex-shrink-0 max-w-[60px]">{r.sub}</span>
            </button>
          ))}
        </div>
      ) : (
        <div ref={treeScrollRef} className="flex-1 overflow-y-auto min-h-0 px-1 space-y-1 pb-1">
          <OrgNodeProvider value={orgNodeCtx}>
            {(() => {
              const allCompanies = [...new Set(viewOrgs.map(o => o.companyId))]
                .filter(Boolean)
                .map(id => ({ id: id!, name: id! }))
              return allCompanies.map(company => {
                const rootOrgs = viewOrgs.filter(
                  o => o.companyId === company.id && (!o.parentId || !viewOrgIds.has(o.parentId))
                )
                if (rootOrgs.length === 0) return null
                const isOpen = !closedCompanies.has(company.id)
                return (
                  <div key={company.id} className="border border-gray-200 rounded">
                    <button
                      onClick={() => toggleCompany(company.id)}
                      className="w-full flex items-center justify-between px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded transition-colors"
                    >
                      <span className="truncate">{company.name}</span>
                      <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-1 py-1">
                        {rootOrgs.map(org => <OrgTreeNode key={org.id} org={org} depth={0} />)}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </OrgNodeProvider>

          {/* 凡例 */}
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 pt-1 border-t border-gray-100 px-1 pb-1">
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-0.5 align-middle" />廃止組織</span>
          </div>
        </div>
      )}
    </div>
  )
}
