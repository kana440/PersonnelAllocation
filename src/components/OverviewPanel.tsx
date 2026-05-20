import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { Organization } from '../types/domain'

const CHANGE_DOT: Record<string, string> = {
  changed: 'bg-yellow-400',
  new:     'bg-green-500',
  removed: 'bg-red-500',
}

export function OverviewPanel() {
  const store = useStore()
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(() => {
    // ルートおよびその直下まで展開した状態で開始
    const viewOrgs = store.afterOrganizations.filter(o => !o.isAbandoned)
    const expanded = new Set<string>()
    const roots = viewOrgs.filter(o => o.parentId === null)
    roots.forEach(o => {
      expanded.add(o.id)
      viewOrgs.filter(c => c.parentId === o.id).forEach(c => expanded.add(c.id))
    })
    return expanded
  })
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    () => new Set(store.companies.map(c => c.id))
  )
  const [isDragActive, setIsDragActive]   = useState(false)
  const [dragOverOrgId, setDragOverOrgId] = useState<string | null>(null)
  const [dragAltKey, setDragAltKey]       = useState(false)

  const { focusOrg, focusedOrgId, selectedPersonId, selectPerson, afterOrganizations } = store

  // Always show after state (non-abandoned orgs)
  const viewOrgs = afterOrganizations.filter(o => !o.isAbandoned)

  const viewAffs = store.afterAffiliations
  const viewPos  = store.afterPositions

  const getPersonsInOrg = (orgId: string) =>
    viewAffs
      .filter(a => a.status === 'active' && viewPos.find(p => p.id === a.positionId)?.orgId === orgId)
      .map(a => ({
        aff:    a,
        person: store.persons.find(p => p.id === a.personId),
        pos:    viewPos.find(p => p.id === a.positionId),
      }))
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  const getOrgChangeStatus = (orgId: string): 'changed' | 'new' | 'removed' | null => {
    const beforeIds = new Set(
      store.beforeAffiliations
        .filter(a => a.status === 'active' && store.beforePositions.find(p => p.id === a.positionId)?.orgId === orgId)
        .map(a => a.personId)
    )
    const afterIds = new Set(
      store.afterAffiliations
        .filter(a => a.status === 'active' && store.afterPositions.find(p => p.id === a.positionId)?.orgId === orgId)
        .map(a => a.personId)
    )
    if (beforeIds.size === 0 && afterIds.size > 0) return 'new'
    if (beforeIds.size > 0 && afterIds.size === 0) return 'removed'
    for (const pid of [...beforeIds, ...afterIds]) {
      if (!beforeIds.has(pid) || !afterIds.has(pid)) return 'changed'
    }
    return null
  }

  const [orgSearch, setOrgSearch] = useState('')
  const orgSearchLower = orgSearch.toLowerCase().trim()

  const toggleOrg     = (id: string) => setExpandedOrgs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleCompany = (id: string) => setExpandedCompanies(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // ── Drop handlers ────────────────────────────────────────────
  const handleOrgDragOver = (e: React.DragEvent, orgId: string) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    setDragOverOrgId(orgId); setDragAltKey(e.altKey)
  }

  const handleOrgDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) setDragOverOrgId(null)
  }

  const handleOrgDrop = (e: React.DragEvent, toOrgId: string) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverOrgId(null); setIsDragActive(false)
    let dragData: { personId: string; fromOrgId: string; fromCompanyId: string }
    try { dragData = JSON.parse(e.dataTransfer.getData('application/json')) } catch { return }
    const { personId, fromCompanyId } = dragData
    const toOrg = viewOrgs.find(o => o.id === toOrgId)
    if (!toOrg) return
    const currentAff = store.afterAffiliations.find(a =>
      a.personId === personId && a.status === 'active' && a.type === 'primary' &&
      store.afterPositions.find(p => p.id === a.positionId)?.companyId === fromCompanyId
    )
    const currentPos = currentAff ? store.afterPositions.find(p => p.id === currentAff.positionId) : null
    const band   = currentPos?.band ?? 'B4'
    const title  = currentPos?.title ?? '担当'
    const pName  = store.persons.find(p => p.id === personId)?.name ?? ''
    // 行エディタからの直接編集に移行予定
    void toOrg; void band; void title; void pName; void fromCompanyId
  }

  // ── Org tree node ─────────────────────────────────────────────
  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children     = viewOrgs.filter(o => o.parentId === org.id)
    const directPeople = getPersonsInOrg(org.id)
    const isExpanded   = expandedOrgs.has(org.id)
    const isSelected   = focusedOrgId === org.id
    const changeStatus = getOrgChangeStatus(org.id)
    const isDropTarget = isDragActive && dragOverOrgId === org.id
    const isNewOrg     = !store.organizations.find(o => o.id === org.id)

    const visiblePeople = isExpanded ? directPeople : []

    return (
      <div key={org.id} style={{ marginLeft: `${depth * 10}px` }}>
        <div
          onDragOver={e => handleOrgDragOver(e, org.id)}
          onDragLeave={handleOrgDragLeave}
          onDrop={e => handleOrgDrop(e, org.id)}
          className={`flex items-center gap-0.5 rounded py-0.5 px-1 transition-colors ${
            isDropTarget
              ? (dragAltKey ? 'bg-purple-100 ring-1 ring-purple-400 ring-inset' : 'bg-blue-100 ring-1 ring-blue-400 ring-inset')
              : isDragActive ? 'hover:bg-blue-50'
              : isSelected ? 'bg-blue-50'
              : 'hover:bg-gray-50'
          }`}
        >
          <button onClick={() => toggleOrg(org.id)} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs">
            {(children.length > 0 || directPeople.length > 0) ? (isExpanded ? '▾' : '▸') : <span className="w-4" />}
          </button>
          <button
            onClick={() => focusOrg(org.id)}
            className={`flex-1 text-left text-xs py-0.5 truncate font-medium ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700 hover:text-blue-600'}`}
          >
            {org.name}
          </button>
          {isNewOrg && <span className="text-xs text-green-600 font-bold flex-shrink-0">新</span>}
          {isDropTarget ? (
            <span className={`text-xs px-1 rounded font-medium flex-shrink-0 ${dragAltKey ? 'text-purple-700 bg-purple-200' : 'text-blue-700 bg-blue-200'}`}>
              {dragAltKey ? '＋兼務' : '→異動'}
            </span>
          ) : (
            <>
              {directPeople.length > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{directPeople.length}</span>}
              {changeStatus && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANGE_DOT[changeStatus]}`} />}
            </>
          )}
        </div>

        {visiblePeople.map(({ aff, person, pos }) => {
          const isPersonSelected = selectedPersonId === person.id
          const isConcurrent     = aff.type === 'concurrent'
          return (
            <div
              key={aff.id}
              style={{ marginLeft: `${depth * 10 + 16}px` }}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer ${isPersonSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
              onClick={() => selectPerson(person.id)}
            >
              <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
                {isConcurrent ? '兼' : '—'}
              </span>
              <span className={`text-xs flex-1 truncate ${isPersonSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'}`}>
                {person.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{pos.band}</span>
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
        sub: store.companies.find(c => c.id === o.companyId)?.name ?? '',
        orgId: o.id, personId: undefined as string | undefined,
      })),
    ...store.persons
      .filter(p => p.name.toLowerCase().includes(orgSearchLower))
      .map(p => {
        const aff = viewAffs.find(a => a.personId === p.id && a.status === 'active' && a.type === 'primary')
        const pos = aff ? viewPos.find(pp => pp.id === aff.positionId) : null
        const org = pos ? viewOrgs.find(o => o.id === pos.orgId) : null
        return {
          type: 'person' as const, id: p.id, label: p.name,
          sub: org?.name ?? '所属なし',
          orgId: org?.id ?? '', personId: p.id,
        }
      }),
    ...viewPos
      .filter(p => p.title && p.title.toLowerCase().includes(orgSearchLower))
      .slice(0, 6)
      .flatMap(p => {
        const org = viewOrgs.find(o => o.id === p.orgId)
        if (!org) return []
        const aff = viewAffs.find(a => a.positionId === p.id && a.status === 'active')
        const person = aff ? store.persons.find(pe => pe.id === aff.personId) : undefined
        return [{
          type: 'position' as const, id: p.id,
          label: `${p.title} (${p.band})`,
          sub: `${org.name}${person ? ` • ${person.name}` : ' • 空席'}`,
          orgId: org.id, personId: person?.id,
        }]
      }),
  ] : []

  return (
    <div
      className={`flex flex-col h-full overflow-hidden transition-colors rounded ${isDragActive ? 'ring-2 ring-blue-200 ring-inset bg-blue-50/30' : ''}`}
      onDragEnter={e => { if (e.dataTransfer.types.includes('application/json')) setIsDragActive(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setIsDragActive(false); setDragOverOrgId(null) } }}
      onDrop={() => setIsDragActive(false)}
    >
      {/* Search */}
      <div className="flex-shrink-0 pb-1">
        <input
          type="text"
          value={orgSearch}
          onChange={e => setOrgSearch(e.target.value)}
          placeholder="🔍 組織・人名"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
        />
      </div>

      {orgSearchLower ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          {searchResults.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-3">該当なし</div>
          )}
          {searchResults.map(r => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                if (r.orgId) focusOrg(r.orgId)
                if (r.type === 'person') selectPerson(r.id)
                if (r.type === 'position' && r.personId) selectPerson(r.personId)
                setOrgSearch('')
              }}
              className="w-full text-left flex items-center gap-1.5 px-1 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              <span className="text-gray-400 text-xs flex-shrink-0">
                {r.type === 'org' ? '🏢' : r.type === 'person' ? '👤' : '💼'}
              </span>
              <span className="text-xs font-medium text-gray-700 truncate flex-1">{r.label}</span>
              <span className="text-xs text-gray-400 truncate flex-shrink-0">{r.sub}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
            {(() => {
              const knownCompanyIds = new Set(store.companies.map(c => c.id))
              const extraIds = [...new Set(viewOrgs.map(o => o.companyId))].filter(id => !knownCompanyIds.has(id))
              const extraCompanies = extraIds.map(id => ({ id, name: id, hasSF: true }))
              const allCompanies = [...store.companies, ...extraCompanies]

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
                      <span>{company.name}{!company.hasSF && <span className="ml-1 font-normal text-gray-400">(SF外)</span>}</span>
                      <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
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

            {/* 所属なし（org/position が未設定の人物）*/}
            {(() => {
              const allAffPersonIds = new Set([
                ...store.beforeAffiliations.map(a => a.personId),
                ...store.afterAffiliations.map(a => a.personId),
              ])
              const unassigned = store.persons.filter(p => !allAffPersonIds.has(p.id))
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
                        onClick={() => selectPerson(p.id)}
                        className={`w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs transition-colors ${
                          selectedPersonId === p.id ? 'bg-yellow-50 text-gray-800 font-semibold' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-gray-300 flex-shrink-0">—</span>
                        <span className="truncate">{p.name}</span>
                        {p.sfPersonId && <span className="text-gray-300 font-mono text-xs flex-shrink-0">{p.sfPersonId}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
          {isDragActive && (
            <div className="flex gap-2 text-xs flex-shrink-0 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 mt-1">
              <span className="text-blue-600 font-medium">ドロップ → 異動</span>
              <span className="text-gray-400">|</span>
              <span className="text-purple-600 font-medium">Alt+ドロップ → 兼務</span>
            </div>
          )}
          {!isDragActive && (
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 flex-shrink-0 pt-1 border-t border-gray-100 mt-1">
              <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-0.5 align-middle" />変更</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-0.5 align-middle" />新規</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-0.5 align-middle" />終了</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
