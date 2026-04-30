import { useState } from 'react'
import { useStore } from '../store/useStore'

interface DragData {
  personId: string
  fromOrgId: string
  fromCompanyId: string
}

interface OrgBoxProps {
  orgId: string
  depth?: number
}

interface CollapsedOrgChipProps {
  orgId: string
}

type CanvasMode = '組織図' | 'レポートライン'

const ORG_PALETTE = [
  { card: 'bg-blue-50 border-blue-200',   tag: 'bg-blue-100 text-blue-700',   text: 'text-blue-800' },
  { card: 'bg-green-50 border-green-200', tag: 'bg-green-100 text-green-700', text: 'text-green-800' },
  { card: 'bg-purple-50 border-purple-200', tag: 'bg-purple-100 text-purple-700', text: 'text-purple-800' },
  { card: 'bg-amber-50 border-amber-200', tag: 'bg-amber-100 text-amber-700', text: 'text-amber-800' },
  { card: 'bg-cyan-50 border-cyan-200',   tag: 'bg-cyan-100 text-cyan-700',   text: 'text-cyan-800' },
  { card: 'bg-rose-50 border-rose-200',   tag: 'bg-rose-100 text-rose-700',   text: 'text-rose-800' },
  { card: 'bg-teal-50 border-teal-200',   tag: 'bg-teal-100 text-teal-700',   text: 'text-teal-800' },
  { card: 'bg-orange-50 border-orange-200', tag: 'bg-orange-100 text-orange-700', text: 'text-orange-800' },
]

export function OrgOperationView() {
  const store = useStore()
  const {
    focusedOrgId, focusOrg, organizations, persons,
    afterPositions, afterAffiliations,
    beforePositions, beforeAffiliations,
    effectiveDate, addOperation,
    selectedPersonId, selectPerson,
  } = store

  const [dragOverOrgId, setDragOverOrgId] = useState<string | null>(null)
  const [highlightedOrgId, setHighlightedOrgId] = useState<string | null>(null)
  const [expandedChipIds, setExpandedChipIds] = useState<Set<string>>(new Set())
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('組織図')
  const [diffMode, setDiffMode] = useState(false)

  if (!focusedOrgId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左の組織ツリーから組織を選択してください
      </div>
    )
  }

  const focusedOrg = organizations.find(o => o.id === focusedOrgId)
  if (!focusedOrg) return null

  const buildBreadcrumb = (orgId: string): Array<{ id: string; name: string }> => {
    const path: Array<{ id: string; name: string }> = []
    let current = organizations.find(o => o.id === orgId)
    while (current) {
      path.unshift({ id: current.id, name: current.name })
      current = current.parentId ? organizations.find(o => o.id === current!.parentId) : undefined
    }
    return path
  }

  const breadcrumb = buildBreadcrumb(focusedOrgId)
  const parentOrg = focusedOrg.parentId ? organizations.find(o => o.id === focusedOrg.parentId) : null
  const childOrgs = organizations.filter(o => o.parentId === focusedOrgId)

  const getPersonsInOrg = (orgId: string) =>
    afterAffiliations
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = afterPositions.find(p => p.id === a.positionId)
        return pos?.orgId === orgId
      })
      .map(a => {
        const person = persons.find(p => p.id === a.personId)
        const pos = afterPositions.find(p => p.id === a.positionId)
        return { aff: a, person, pos }
      })
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  const getBeforeOrgName = (personId: string, currentOrgId: string): string | null => {
    const bAff = beforeAffiliations.find(a => {
      if (a.personId !== personId || a.status !== 'active') return false
      const pos = beforePositions.find(p => p.id === a.positionId)
      return pos != null && pos.orgId !== currentOrgId
    })
    if (!bAff) return null
    const bPos = beforePositions.find(p => p.id === bAff.positionId)
    if (!bPos) return null
    const bOrg = organizations.find(o => o.id === bPos.orgId)
    return bOrg?.name ?? null
  }

  // Persons who were in this org before but aren't after (for diff mode)
  const getDepartedPersons = (orgId: string) =>
    beforeAffiliations
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = beforePositions.find(p => p.id === a.positionId)
        return pos?.orgId === orgId
      })
      .filter(a => !afterAffiliations.some(aa =>
        aa.personId === a.personId && aa.status === 'active' &&
        afterPositions.find(p => p.id === aa.positionId)?.orgId === orgId
      ))
      .map(a => {
        const person = persons.find(p => p.id === a.personId)
        const pos = beforePositions.find(p => p.id === a.positionId)
        const afterAff = afterAffiliations.find(aa =>
          aa.personId === a.personId && aa.status === 'active'
        )
        const afterPos = afterAff ? afterPositions.find(p => p.id === afterAff.positionId) : null
        const afterOrg = afterPos ? organizations.find(o => o.id === afterPos.orgId) : null
        return { person, pos, afterOrg }
      })
      .filter((x): x is { person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos>; afterOrg: typeof x.afterOrg } =>
        x.person != null && x.pos != null
      )

  const handleDragStart = (e: React.DragEvent, personId: string, fromOrgId: string, fromCompanyId: string) => {
    const data: DragData = { personId, fromOrgId, fromCompanyId }
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, orgId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverOrgId(orgId)
  }

  const handleDragLeave = () => setDragOverOrgId(null)

  const handleDrop = (e: React.DragEvent, toOrgId: string) => {
    e.preventDefault()
    setDragOverOrgId(null)

    let data: DragData
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData
    } catch {
      return
    }

    const { personId, fromOrgId, fromCompanyId } = data
    if (fromOrgId === toOrgId) return

    const toOrg = organizations.find(o => o.id === toOrgId)
    if (!toOrg) return
    const toCompanyId = toOrg.companyId

    const currentAff = afterAffiliations.find(a =>
      a.personId === personId && a.status === 'active' &&
      afterPositions.find(p => p.id === a.positionId)?.orgId === fromOrgId
    )
    const currentPos = currentAff ? afterPositions.find(p => p.id === currentAff.positionId) : null
    const band = currentPos?.band ?? 'B4'
    const title = currentPos?.title ?? '担当'
    const toOrgName = toOrg.name
    const personName = persons.find(p => p.id === personId)?.name ?? personId

    if (e.altKey) {
      addOperation({ kind: 'AddConcurrent', label: `兼務追加：${toOrgName} (${personName})`, params: { personId, orgId: toOrgId, companyId: toCompanyId, band, title }, effectiveDate })
    } else if (fromCompanyId !== toCompanyId) {
      addOperation({ kind: 'SendOnSecondment', label: `出向：${toOrgName} (${personName})`, params: { personId, toCompanyId, orgId: toOrgId, band, title }, effectiveDate })
    } else {
      addOperation({ kind: 'MoveToOrg', label: `組織異動：${toOrgName} (${personName})`, params: { personId, toOrgId, companyId: fromCompanyId, band, title }, effectiveDate })
    }

    setHighlightedOrgId(toOrgId)
    setTimeout(() => setHighlightedOrgId(null), 800)
  }

  // ── Shared person card ─────────────────────────────────────────
  const renderPersonCards = (orgId: string, companyId: string) => {
    const personsInOrg = getPersonsInOrg(orgId)
    if (personsInOrg.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {personsInOrg.map(({ aff, person, pos }) => {
          const fromOrgName = getBeforeOrgName(person.id, orgId)
          const isConcurrent = aff.type === 'concurrent'
          const isSelected = selectedPersonId === person.id
          return (
            <div
              key={aff.id}
              draggable
              onDragStart={e => handleDragStart(e, person.id, orgId, companyId)}
              onClick={() => selectPerson(person.id)}
              className={`relative px-2.5 py-1.5 rounded text-xs cursor-grab active:cursor-grabbing select-none transition-all hover:shadow-md ${
                isConcurrent
                  ? 'border-2 border-dashed border-purple-400 bg-purple-50'
                  : 'border-2 border-blue-300 bg-blue-50'
              } ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
            >
              {fromOrgName && (
                <div className="text-gray-400 text-xs leading-tight mb-0.5">← {fromOrgName}</div>
              )}
              <div className="font-semibold text-gray-800 leading-tight">{person.name}</div>
              <div className="text-gray-500 leading-tight">
                {pos.title}
                {pos.band && <span className={`ml-1 font-medium ${isConcurrent ? 'text-purple-600' : 'text-blue-600'}`}>{pos.band}</span>}
              </div>
              {isConcurrent && <div className="text-purple-600 text-xs leading-tight">兼務</div>}
            </div>
          )
        })}
      </div>
    )
  }

  const renderDepartedCards = (orgId: string) => {
    if (!diffMode) return null
    const departed = getDepartedPersons(orgId)
    if (departed.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {departed.map(({ person, pos, afterOrg }) => (
          <div
            key={person.id}
            className="px-2.5 py-1.5 rounded text-xs border-2 border-dashed border-red-300 bg-red-50 opacity-70 select-none"
          >
            <div className="font-semibold text-gray-400 line-through leading-tight">{person.name}</div>
            <div className="text-gray-400 leading-tight">
              {pos.title}
              {pos.band && <span className="ml-1">{pos.band}</span>}
            </div>
            {afterOrg && <div className="text-red-500 leading-tight text-xs">→ {afterOrg.name}</div>}
          </div>
        ))}
      </div>
    )
  }

  const renderDropZone = (orgId: string, compact = false) => (
    <div className={`${compact ? 'min-h-6' : 'min-h-8'} rounded border border-dashed text-xs text-center ${compact ? 'py-1' : 'py-1.5'} transition-colors ${
      dragOverOrgId === orgId
        ? 'border-blue-400 bg-blue-100 text-blue-600'
        : 'border-gray-300 text-gray-300'
    }`}>
      {dragOverOrgId === orgId ? 'ここにドロップ' : getPersonsInOrg(orgId).length === 0 && !compact ? 'ドロップで異動' : ''}
    </div>
  )

  // ── CollapsedOrgChip ───────────────────────────────────────────
  const CollapsedOrgChip = ({ orgId }: CollapsedOrgChipProps) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null

    const personsInOrg = getPersonsInOrg(orgId)
    const childOrgIds = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isDragOver = dragOverOrgId === orgId
    const isHighlighted = highlightedOrgId === orgId
    const isExpanded = expandedChipIds.has(orgId)

    const toggleExpand = () =>
      setExpandedChipIds(prev => {
        const next = new Set(prev)
        next.has(orgId) ? next.delete(orgId) : next.add(orgId)
        return next
      })

    if (!isExpanded) {
      return (
        <div
          className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs cursor-pointer select-none transition-all ${
            isHighlighted ? 'border-green-400 bg-green-50' :
            isDragOver    ? 'border-blue-400 bg-blue-50'  :
            'border-gray-200 bg-white hover:bg-gray-50'
          }`}
          onClick={toggleExpand}
          onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
          onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
          onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
        >
          <span className="text-gray-400 flex-shrink-0">▸</span>
          <span className="font-medium text-gray-700 truncate">{org.name}</span>
          {personsInOrg.length > 0 && <span className="text-gray-400 flex-shrink-0">{personsInOrg.length}名</span>}
          {childOrgIds.length > 0 && <span className="text-gray-400 flex-shrink-0">{childOrgIds.length}組織</span>}
          {isDragOver && <span className="text-blue-500 flex-shrink-0">← ドロップ</span>}
        </div>
      )
    }

    return (
      <div
        className={`border-2 rounded-lg transition-all ${
          isHighlighted ? 'border-green-400 bg-green-50' :
          isDragOver    ? 'border-blue-400 bg-blue-50'  :
          'border-gray-200 bg-white'
        }`}
        onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
        onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
        onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
      >
        <div
          className="px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 flex items-center gap-1"
          onClick={toggleExpand}
        >
          <span className="text-gray-400">▾</span>
          {org.name}
        </div>
        <div className="p-2">
          {renderDepartedCards(orgId)}
          {renderPersonCards(orgId, org.companyId)}
          {renderDropZone(orgId)}
          {childOrgIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {childOrgIds.map(id => <CollapsedOrgChip key={id} orgId={id} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── OrgBox ─────────────────────────────────────────────────────
  const OrgBox = ({ orgId, depth = 0 }: OrgBoxProps) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null

    const childOrgIds = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isDragOver = dragOverOrgId === orgId
    const isHighlighted = highlightedOrgId === orgId

    return (
      <div
        className={`border-2 rounded-lg transition-all ${
          isHighlighted ? 'border-green-400 bg-green-50' :
          isDragOver    ? 'border-blue-400 bg-blue-50'  :
          depth === 0   ? 'border-gray-300 bg-gray-50'  :
          'border-gray-200 bg-white'
        }`}
        onDragOver={e => handleDragOver(e, orgId)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, orgId)}
      >
        <div className={`px-3 py-1.5 border-b text-xs font-semibold ${
          depth === 0
            ? 'border-gray-300 text-gray-600 bg-gray-100 rounded-t-lg'
            : 'border-gray-200 text-gray-500 bg-gray-50 rounded-t-lg'
        }`}>
          {org.name}
        </div>
        <div className="p-2">
          {renderDepartedCards(orgId)}
          {renderPersonCards(orgId, org.companyId)}
          {renderDropZone(orgId)}
          {childOrgIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {childOrgIds.map(childId => <CollapsedOrgChip key={childId} orgId={childId} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Report line view ───────────────────────────────────────────
  const ReportLineView = () => {
    const getAllOrgsInTree = (rootId: string): string[] => {
      const result = [rootId]
      organizations.filter(o => o.parentId === rootId).forEach(c =>
        result.push(...getAllOrgsInTree(c.id))
      )
      return result
    }

    const orgsInScope = getAllOrgsInTree(focusedOrgId)

    const orgColorMap = Object.fromEntries(
      orgsInScope.map((id, i) => [id, ORG_PALETTE[i % ORG_PALETTE.length]])
    )

    // Primary affiliation for a person within the scope
    const getPersonScopeAff = (personId: string) => {
      const aff = afterAffiliations.find(a => {
        if (a.personId !== personId || a.status !== 'active') return false
        const pos = afterPositions.find(p => p.id === a.positionId)
        return pos != null && orgsInScope.includes(pos.orgId)
      })
      if (!aff) return null
      const pos = afterPositions.find(p => p.id === aff.positionId)!
      return { aff, pos, orgId: pos.orgId }
    }

    const personsInScope = [...new Set(
      afterAffiliations
        .filter(a => {
          if (a.status !== 'active') return false
          const pos = afterPositions.find(p => p.id === a.positionId)
          return pos != null && orgsInScope.includes(pos.orgId)
        })
        .map(a => a.personId)
    )]

    const getDirectReports = (managerId: string) =>
      personsInScope.filter(pid => getPersonScopeAff(pid)?.aff.managerId === managerId)

    const roots = personsInScope.filter(pid => {
      const sa = getPersonScopeAff(pid)
      if (!sa) return false
      const mgr = sa.aff.managerId
      return !mgr || !personsInScope.includes(mgr)
    })

    const ReportNode = ({ personId, depth = 0 }: { personId: string; depth?: number }) => {
      const person = persons.find(p => p.id === personId)
      const sa = getPersonScopeAff(personId)
      if (!person || !sa) return null

      const color = orgColorMap[sa.orgId]
      const org = organizations.find(o => o.id === sa.orgId)
      const directReports = getDirectReports(personId)
      const isSelected = selectedPersonId === personId

      return (
        <div className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-3 mt-1.5' : 'mt-1.5'}>
          <button
            onClick={() => selectPerson(personId)}
            className={`text-left inline-block px-2.5 py-1.5 rounded border text-xs transition-all hover:shadow-sm ${color.card} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
          >
            <div className={`font-semibold leading-tight ${color.text}`}>{person.name}</div>
            <div className="text-gray-500 leading-tight">
              {sa.pos.title}
              {sa.pos.band && <span className={`ml-1 font-medium ${color.text}`}>{sa.pos.band}</span>}
            </div>
            {org && (
              <span className={`inline-block text-xs px-1 rounded mt-0.5 leading-tight ${color.tag}`}>
                {org.name}
              </span>
            )}
          </button>
          {directReports.map(id => <ReportNode key={id} personId={id} depth={depth + 1} />)}
        </div>
      )
    }

    const orgsWithPersons = orgsInScope.filter(orgId =>
      personsInScope.some(pid => getPersonScopeAff(pid)?.orgId === orgId)
    )

    return (
      <div className="p-4">
        {/* Org color legend */}
        {orgsWithPersons.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {orgsWithPersons.map(orgId => {
              const org = organizations.find(o => o.id === orgId)
              const color = orgColorMap[orgId]
              return org ? (
                <span key={orgId} className={`px-2 py-0.5 rounded text-xs ${color.tag}`}>
                  {org.name}
                </span>
              ) : null
            })}
          </div>
        )}

        {roots.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-12">
            上司情報が設定されていません
            <div className="text-xs mt-1">発令後の affiliations に managerId を設定してください</div>
          </div>
        ) : (
          roots.map(pid => <ReportNode key={pid} personId={pid} />)
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        {parentOrg && (
          <>
            <button
              onClick={() => focusOrg(parentOrg.id)}
              className="text-xs text-gray-500 hover:text-blue-600"
            >
              ← 上の組織へ
            </button>
            <span className="text-gray-300">|</span>
          </>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-400">&gt;</span>}
              <button
                onClick={() => focusOrg(crumb.id)}
                className={`hover:text-blue-600 ${i === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-500'}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['組織図', 'レポートライン'] as CanvasMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setCanvasMode(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  canvasMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {canvasMode === '組織図' && (
            <button
              onClick={() => setDiffMode(d => !d)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                diffMode
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {diffMode ? '差分ON' : '差分'}
            </button>
          )}

          {canvasMode === '組織図' && (
            <span className="text-xs text-gray-400">Alt+ドロップ = 兼務追加</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto p-4">
        {canvasMode === 'レポートライン' ? (
          <ReportLineView />
        ) : childOrgs.length === 0 ? (
          <OrgBox orgId={focusedOrgId} depth={0} />
        ) : (
          <div
            className={`border-2 rounded-lg transition-all ${
              dragOverOrgId === focusedOrgId ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            <div className="px-3 py-2 border-b border-gray-300 bg-gray-100 rounded-t-lg">
              <span className="text-sm font-semibold text-gray-700">{focusedOrg.name}</span>
            </div>

            {/* Focused org's own members + drop zone */}
            <div
              className="px-3 py-2"
              onDragOver={e => handleDragOver(e, focusedOrgId)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, focusedOrgId)}
            >
              {renderDepartedCards(focusedOrgId)}
              {renderPersonCards(focusedOrgId, focusedOrg.companyId)}
              {renderDropZone(focusedOrgId, true)}
            </div>

            {/* Child org boxes grid */}
            <div className="px-3 pb-3 grid grid-cols-2 gap-3">
              {childOrgs.map(childOrg => (
                <OrgBox key={childOrg.id} orgId={childOrg.id} depth={0} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
