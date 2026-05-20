import { useState } from 'react'
import { useStore } from '../store/useStore'
import { rowDiff } from '../domain/allocationRow'
import type { Organization } from '../types/domain'

const CHANGE_DOT: Record<string, string> = {
  changed: 'bg-yellow-400',
  new:     'bg-green-500',
  removed: 'bg-red-500',
}

export function OrgSearchSidebar() {
  const {
    afterOrganizations, organizations: beforeOrgs, companies,
    afterPositions, afterAffiliations,
    beforePositions, beforeAffiliations,
    persons, allocationList,
    focusedOrgId, focusOrg, selectedPersonId, selectPerson, enterEditMode,
  } = useStore()

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)

  const enterEditForPerson = (personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const firstRow = allocationList.find(r => r.userId === person.sfPersonId)
    if (!firstRow) return
    enterEditMode(firstRow.rowId)
  }

  const handlePersonDoubleClick = (personId: string) => enterEditForPerson(personId)

  const handlePersonContextMenu = (e: React.MouseEvent, personId: string) => {
    e.preventDefault()
    e.stopPropagation()
    selectPerson(personId)
    setContextMenu({ x: e.clientX, y: e.clientY, personId })
  }

  // サイドバーからの D&D: OrgOperationView の DragData 形式に合わせる
  const handlePersonDragStart = (e: React.DragEvent, personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person) return
    const aff = viewAffs.find(a => a.personId === person.id && a.status === 'active' && a.type === 'primary')
    const pos  = aff ? viewPos.find(p => p.id === aff.positionId) : null
    const org  = pos ? viewOrgs.find(o => o.id === pos.orgId) : null
    e.dataTransfer.setData('application/json', JSON.stringify({
      personId,
      fromOrgId:       org?.id ?? '',
      fromCompanyId:   org?.companyId ?? '',
      affiliationType: 'primary',
      source:          'sidebar',
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const viewOrgs = afterOrganizations.filter(o => !o.isAbandoned)
  const viewAffs = afterAffiliations
  const viewPos  = afterPositions

  const [orgSearch, setOrgSearch] = useState('')
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(() => {
    const expanded = new Set<string>()
    const roots = viewOrgs.filter(o => o.parentId === null)
    roots.forEach(o => {
      expanded.add(o.id)
      viewOrgs.filter(c => c.parentId === o.id).forEach(c => expanded.add(c.id))
    })
    return expanded
  })
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    () => new Set(companies.map(c => c.id))
  )

  const orgSearchLower = orgSearch.toLowerCase().trim()

  const hasPersonChanges = (personId: string): boolean => {
    const sfId = persons.find(p => p.id === personId)?.sfPersonId ?? ''
    return allocationList.filter(r => r.userId === sfId).some(r => rowDiff(r).length > 0)
  }

  const getPersonsInOrg = (orgId: string) =>
    viewAffs
      .filter(a => a.status === 'active' && viewPos.find(p => p.id === a.positionId)?.orgId === orgId)
      .map(a => ({
        aff:    a,
        person: persons.find(p => p.id === a.personId),
        pos:    viewPos.find(p => p.id === a.positionId),
      }))
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  const getOrgChangeStatus = (orgId: string): 'changed' | 'new' | 'removed' | null => {
    const beforeIds = new Set(
      beforeAffiliations
        .filter(a => a.status === 'active' && beforePositions.find(p => p.id === a.positionId)?.orgId === orgId)
        .map(a => a.personId)
    )
    const afterIds = new Set(
      viewAffs
        .filter(a => a.status === 'active' && viewPos.find(p => p.id === a.positionId)?.orgId === orgId)
        .map(a => a.personId)
    )
    if (beforeIds.size === 0 && afterIds.size > 0) return 'new'
    if (beforeIds.size > 0 && afterIds.size === 0) return 'removed'
    for (const pid of [...beforeIds, ...afterIds]) {
      if (!beforeIds.has(pid) || !afterIds.has(pid)) return 'changed'
    }
    return null
  }

  const toggleOrg     = (id: string) => setExpandedOrgs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleCompany = (id: string) => setExpandedCompanies(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children     = viewOrgs.filter(o => o.parentId === org.id)
    const directPeople = getPersonsInOrg(org.id)
    const isExpanded   = expandedOrgs.has(org.id)
    const isSelected   = focusedOrgId === org.id
    const changeStatus = getOrgChangeStatus(org.id)
    const isNewOrg     = !beforeOrgs.find(o => o.id === org.id)

    return (
      <div key={org.id} style={{ marginLeft: `${depth * 10}px` }}>
        <div className={`flex items-center gap-0.5 rounded py-0.5 px-1 transition-colors ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}>
          <button
            onClick={() => toggleOrg(org.id)}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs"
          >
            {(children.length > 0 || directPeople.length > 0)
              ? (isExpanded ? '▾' : '▸')
              : <span className="w-4" />}
          </button>
          <button
            onClick={() => focusOrg(org.id)}
            className={`flex-1 text-left text-xs py-0.5 truncate font-medium ${
              isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700 hover:text-blue-600'
            }`}
          >
            {org.name}
          </button>
          {isNewOrg && <span className="text-xs text-green-600 font-bold flex-shrink-0">新</span>}
          {directPeople.length > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{directPeople.length}</span>}
          {changeStatus && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANGE_DOT[changeStatus]}`} />}
        </div>

        {isExpanded && directPeople.map(({ aff, person, pos }) => {
          const isPersonSelected = selectedPersonId === person.id
          const isConcurrent     = aff.type === 'concurrent'
          const hasChange        = hasPersonChanges(person.id)
          return (
            <div
              key={aff.id}
              draggable
              style={{ marginLeft: `${depth * 10 + 16}px` }}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-grab active:cursor-grabbing ${
                isPersonSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => selectPerson(person.id)}
              onDoubleClick={() => handlePersonDoubleClick(person.id)}
              onContextMenu={e => handlePersonContextMenu(e, person.id)}
              onDragStart={e => handlePersonDragStart(e, person.id)}
            >
              <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
                {isConcurrent ? '兼' : '—'}
              </span>
              <span className={`text-xs flex-1 truncate ${
                isPersonSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'
              }`}>
                {person.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{pos.band}</span>
              {hasChange && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
              {isPersonSelected && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
            </div>
          )
        })}

        {isExpanded && children.map(c => renderOrgNode(c, depth + 1))}
      </div>
    )
  }

  const searchResults = orgSearchLower ? [
    ...viewOrgs
      .filter(o => o.name.toLowerCase().includes(orgSearchLower))
      .map(o => ({
        type: 'org' as const, id: o.id, label: o.name,
        sub: companies.find(c => c.id === o.companyId)?.name ?? '',
        orgId: o.id, personId: undefined as string | undefined,
      })),
    ...persons
      .filter(p => p.name.toLowerCase().includes(orgSearchLower))
      .map(p => {
        const aff = viewAffs.find(a => a.personId === p.id && a.status === 'active' && a.type === 'primary')
        const pos = aff ? viewPos.find(pp => pp.id === aff.positionId) : null
        const org = pos ? viewOrgs.find(o => o.id === pos.orgId) : null
        return {
          type: 'person' as const, id: p.id, label: p.name,
          sub: org?.name ?? '所属なし',
          orgId: org?.id, personId: p.id,
        }
      }),
  ] : []

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Search */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1.5">
        <input
          type="text"
          value={orgSearch}
          onChange={e => setOrgSearch(e.target.value)}
          placeholder="🔍 組織・人名"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
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
                if (r.orgId) focusOrg(r.orgId)
                if (r.personId) selectPerson(r.personId)
                setOrgSearch('')
              }}
              className="w-full text-left flex items-center gap-1.5 px-1 py-1 rounded hover:bg-blue-50 transition-colors"
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
        <div className="flex-1 overflow-y-auto min-h-0 px-1 space-y-1 pb-1">
          {(() => {
            const knownCompanyIds = new Set(companies.map(c => c.id))
            const extraIds = [...new Set(viewOrgs.map(o => o.companyId))].filter(id => !knownCompanyIds.has(id))
            const allCompanies = [
              ...companies,
              ...extraIds.map(id => ({ id, name: id, hasSF: true })),
            ]
            return allCompanies.map(company => {
              const rootOrgs = viewOrgs.filter(o => o.companyId === company.id && o.parentId === null)
              if (rootOrgs.length === 0) return null
              const isOpen = expandedCompanies.has(company.id)
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
                      {rootOrgs.map(org => renderOrgNode(org, 0))}
                    </div>
                  )}
                </div>
              )
            })
          })()}

          {/* 所属なし */}
          {(() => {
            const allAffPersonIds = new Set([
              ...beforeAffiliations.map(a => a.personId),
              ...viewAffs.map(a => a.personId),
            ])
            const unassigned = persons.filter(p => !allAffPersonIds.has(p.id))
            if (unassigned.length === 0) return null
            return (
              <div className="border border-dashed border-gray-200 rounded">
                <div className="px-2 py-1 text-xs font-semibold text-gray-400 bg-gray-50 rounded-t">
                  所属なし ({unassigned.length})
                </div>
                <div className="px-1 py-0.5">
                  {unassigned.map(p => (
                    <button
                      key={p.id}
                      draggable
                      onClick={() => selectPerson(p.id)}
                      onDoubleClick={() => handlePersonDoubleClick(p.id)}
                      onContextMenu={e => handlePersonContextMenu(e, p.id)}
                      onDragStart={e => handlePersonDragStart(e, p.id)}
                      className={`w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs transition-colors cursor-grab active:cursor-grabbing ${
                        selectedPersonId === p.id ? 'bg-yellow-50 text-gray-800 font-semibold' : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-300 flex-shrink-0">—</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 pt-1 border-t border-gray-100 px-1 pb-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-0.5 align-middle" />組織変更</span>
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-0.5 align-middle" />行変更</span>
          </div>
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null) }} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const p = persons.find(pp => pp.id === contextMenu.personId)
              return p ? <div className="px-3 py-1.5 border-b border-gray-100 text-xs font-semibold text-gray-500 truncate">{p.name}</div> : null
            })()}
            <button
              onClick={() => { enterEditForPerson(contextMenu.personId); setContextMenu(null) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
            >
              <span>✏️</span> 編集画面を開く
            </button>
          </div>
        </>
      )}
    </div>
  )
}
