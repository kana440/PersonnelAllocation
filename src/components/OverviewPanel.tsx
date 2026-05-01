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
  const [search, setSearch]           = useState('')
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(
    new Set(['org_a', 'org_a_keiei', 'org_a_eigyo', 'org_b', 'org_c'])
  )
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    new Set(['comp_a', 'comp_b', 'comp_c'])
  )
  const [isDragActive, setIsDragActive]   = useState(false)
  const [dragOverOrgId, setDragOverOrgId] = useState<string | null>(null)
  const [dragAltKey, setDragAltKey]       = useState(false)

  const {
    overviewViewMode, setOverviewViewMode,
    focusOrg, focusedOrgId,
    selectedPersonId, selectPerson,
  } = store

  const viewAffs = overviewViewMode === 'before' ? store.beforeAffiliations : store.afterAffiliations
  const viewPos  = overviewViewMode === 'before' ? store.beforePositions    : store.afterPositions
  const searchLower = search.toLowerCase()

  // People directly assigned to this org
  const getPersonsInOrg = (orgId: string) =>
    viewAffs
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = viewPos.find(p => p.id === a.positionId)
        return pos?.orgId === orgId
      })
      .map(a => {
        const person = store.persons.find(p => p.id === a.personId)
        const pos    = viewPos.find(p => p.id === a.positionId)
        return { aff: a, person, pos }
      })
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  // Change indicator for an org
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

  // Recursive search: does this org or any of its descendants have a match?
  const orgHasMatch = (orgId: string): boolean => {
    if (!searchLower) return true
    const org = store.organizations.find(o => o.id === orgId)
    if (org?.name.toLowerCase().includes(searchLower)) return true
    if (getPersonsInOrg(orgId).some(x => x.person.name.toLowerCase().includes(searchLower))) return true
    return store.organizations.filter(o => o.parentId === orgId).some(c => orgHasMatch(c.id))
  }

  const toggleOrg = (orgId: string) =>
    setExpandedOrgs(prev => { const s = new Set(prev); s.has(orgId) ? s.delete(orgId) : s.add(orgId); return s })

  const toggleCompany = (companyId: string) =>
    setExpandedCompanies(prev => { const s = new Set(prev); s.has(companyId) ? s.delete(companyId) : s.add(companyId); return s })

  // ── Drag-and-drop handlers (receive drops from main canvas) ───
  const handleOrgDragOver = (e: React.DragEvent, orgId: string) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    setDragOverOrgId(orgId)
    setDragAltKey(e.altKey)
  }

  const handleOrgDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) {
      setDragOverOrgId(null)
    }
  }

  const handleOrgDrop = (e: React.DragEvent, toOrgId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverOrgId(null)
    setIsDragActive(false)

    let dragData: { personId: string; fromOrgId: string; fromCompanyId: string }
    try {
      dragData = JSON.parse(e.dataTransfer.getData('application/json'))
    } catch { return }

    const { personId, fromCompanyId } = dragData
    const toOrg = store.organizations.find(o => o.id === toOrgId)
    if (!toOrg) return

    // Derive person's current band/title from after state
    const currentAff = store.afterAffiliations.find(a =>
      a.personId === personId && a.status === 'active' && a.type === 'primary' &&
      store.afterPositions.find(p => p.id === a.positionId)?.companyId === fromCompanyId
    )
    const currentPos = currentAff ? store.afterPositions.find(p => p.id === currentAff.positionId) : null
    const band       = currentPos?.band ?? 'B4'
    const title      = currentPos?.title ?? '担当'
    const personName = store.persons.find(p => p.id === personId)?.name ?? ''

    if (e.altKey) {
      store.addOperation({
        kind: 'AddConcurrent',
        label: `兼務追加：${toOrg.name} (${personName})`,
        params: { personId, orgId: toOrgId, companyId: toOrg.companyId, band, title },
        effectiveDate: store.effectiveDate,
      })
    } else if (fromCompanyId !== toOrg.companyId) {
      store.addOperation({
        kind: 'SendOnSecondment',
        label: `出向：${toOrg.name} (${personName})`,
        params: { personId, toCompanyId: toOrg.companyId, orgId: toOrgId, band, title },
        effectiveDate: store.effectiveDate,
      })
    } else {
      store.addOperation({
        kind: 'MoveToOrg',
        label: `組織異動：${toOrg.name} (${personName})`,
        params: { personId, toOrgId, companyId: fromCompanyId, band, title },
        effectiveDate: store.effectiveDate,
      })
    }
  }

  // ── Org tree node ─────────────────────────────────────────────
  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    if (searchLower && !orgHasMatch(org.id)) return null

    const children     = store.organizations.filter(o => o.parentId === org.id)
    const directPeople = getPersonsInOrg(org.id)
    const isExpanded   = expandedOrgs.has(org.id) || (searchLower.length > 0)
    const isSelected   = focusedOrgId === org.id
    const changeStatus = getOrgChangeStatus(org.id)

    // Which children orgs pass the filter
    const visibleChildren = children
      .map(c => renderOrgNode(c, depth + 1))
      .filter(Boolean)

    // Which direct people to show
    const orgNameMatches = org.name.toLowerCase().includes(searchLower)
    const visiblePeople = isExpanded
      ? (searchLower && !orgNameMatches
          ? directPeople.filter(x => x.person.name.toLowerCase().includes(searchLower))
          : directPeople)
      : []

    const isDropTarget = isDragActive && dragOverOrgId === org.id

    return (
      <div key={org.id} style={{ marginLeft: `${depth * 10}px` }}>
        {/* Org row — also a drop target */}
        <div
          onDragOver={e => handleOrgDragOver(e, org.id)}
          onDragLeave={handleOrgDragLeave}
          onDrop={e => handleOrgDrop(e, org.id)}
          className={`flex items-center gap-0.5 rounded py-0.5 px-1 group transition-colors ${
            isDropTarget
              ? (dragAltKey ? 'bg-purple-100 ring-1 ring-purple-400 ring-inset' : 'bg-blue-100 ring-1 ring-blue-400 ring-inset')
              : isDragActive ? 'hover:bg-blue-50'
              : isSelected  ? 'bg-blue-50'
              : 'hover:bg-gray-50'
          }`}
        >
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

          {/* drop indicator */}
          {isDropTarget && (
            <span className={`text-xs px-1 rounded font-medium flex-shrink-0 ${
              dragAltKey ? 'text-purple-700 bg-purple-200' : 'text-blue-700 bg-blue-200'
            }`}>
              {dragAltKey ? '＋兼務' : '→異動'}
            </span>
          )}

          {/* person count (direct only) — hide during drag-over to make room */}
          {!isDropTarget && directPeople.length > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0">{directPeople.length}</span>
          )}

          {!isDropTarget && changeStatus && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANGE_DOT[changeStatus]}`} />
          )}
        </div>

        {/* Direct people rows */}
        {visiblePeople.map(({ aff, person, pos }) => {
          const isPersonSelected = selectedPersonId === person.id
          const isConcurrent = aff.type === 'concurrent'
          return (
            <div
              key={person.id}
              style={{ marginLeft: `${depth * 10 + 16}px` }}
              className={`flex items-center gap-1 py-0.5 px-1 rounded group cursor-pointer ${
                isPersonSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => selectPerson(person.id)}
            >
              <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
                {isConcurrent ? '兼' : '—'}
              </span>
              <span className={`text-xs flex-1 truncate ${isPersonSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'}`}>
                {person.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{pos.band}</span>
              {isPersonSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
              )}
            </div>
          )
        })}

        {/* Child org nodes */}
        {isExpanded && visibleChildren}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col h-full overflow-hidden gap-2 transition-colors rounded ${
        isDragActive ? 'ring-2 ring-blue-200 ring-inset bg-blue-50/30' : ''
      }`}
      onDragEnter={e => { if (e.dataTransfer.types.includes('application/json')) setIsDragActive(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setIsDragActive(false); setDragOverOrgId(null) } }}
      onDrop={() => setIsDragActive(false)}
    >

      {/* Search — shows drag hint when active */}
      <input
        type="text"
        placeholder={isDragActive ? '組織を検索してドロップ…' : '組織名・人名で検索'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1 text-xs flex-shrink-0"
      />

      {/* Before/After toggle */}
      <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg flex-shrink-0">
        {(['before', 'after'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setOverviewViewMode(mode)}
            className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
              overviewViewMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {mode === 'before' ? '発令前' : '発令後'}
          </button>
        ))}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
        {store.companies.map(company => {
          const rootOrgs = store.organizations.filter(o => o.companyId === company.id && o.parentId === null)
          const isOpen   = expandedCompanies.has(company.id)

          // Skip company if nothing matches search
          if (searchLower) {
            const hasMatch = rootOrgs.some(org => orgHasMatch(org.id))
            if (!hasMatch) return null
          }

          return (
            <div key={company.id} className="border border-gray-200 rounded">
              <button
                onClick={() => toggleCompany(company.id)}
                className="w-full flex items-center justify-between px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded"
              >
                <span>
                  {company.name}
                  {!company.hasSF && <span className="ml-1 font-normal text-gray-400">(SF外)</span>}
                </span>
                <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
              </button>
              {(isOpen || searchLower) && (
                <div className="px-1 py-1">
                  {rootOrgs.map(org => renderOrgNode(org, 0))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend / drag hint */}
      {isDragActive ? (
        <div className="flex gap-2 text-xs flex-shrink-0 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
          <span className="text-blue-600 font-medium">ドロップ → 異動</span>
          <span className="text-gray-400">|</span>
          <span className="text-purple-600 font-medium">Alt+ドロップ → 兼務</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 flex-shrink-0">
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-0.5 align-middle" />変更</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-0.5 align-middle" />新規</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-0.5 align-middle" />終了</span>
          <span className="ml-auto"><span className="text-blue-300 mr-0.5">—</span>本務 <span className="text-purple-400 ml-1 mr-0.5">兼</span>兼務</span>
        </div>
      )}
    </div>
  )
}
