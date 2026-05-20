import { useState } from 'react'
import { useStore } from '../store/useStore'
import { rowDiff } from '../domain/allocationRow'

interface DragData {
  personId: string
  fromOrgId: string
  fromCompanyId: string
  affiliationType: 'primary' | 'concurrent'
  source: 'before'
}

type FilterMode = 'all' | 'changed'

export function BeforeOrgCanvas() {
  const store = useStore()
  const {
    beforeFocusedOrgId, focusBefore, organizations, persons,
    beforePositions, beforeAffiliations,
    allocationList,
    selectedPersonId, selectPerson,
  } = store
  const focusedOrgId = beforeFocusedOrgId
  const focusOrg = focusBefore

  const [filterMode, setFilterMode]       = useState<FilterMode>('all')
  const [expandedChipIds, setExpandedChipIds] = useState<Set<string>>(new Set())

  if (!focusedOrgId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 組織を選択してください
      </div>
    )
  }

  const focusedOrg = organizations.find(o => o.id === focusedOrgId)
  if (!focusedOrg) return null

  const buildBreadcrumb = (orgId: string): Array<{ id: string; name: string }> => {
    const path: Array<{ id: string; name: string }> = []
    let cur = organizations.find(o => o.id === orgId)
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name })
      cur = cur.parentId ? organizations.find(o => o.id === cur!.parentId) : undefined
    }
    return path
  }

  const breadcrumb = buildBreadcrumb(focusedOrgId)
  const parentOrg  = focusedOrg.parentId ? organizations.find(o => o.id === focusedOrg.parentId) : null
  const childOrgs  = organizations.filter(o => o.parentId === focusedOrgId)

  const getPersonsInOrg = (orgId: string) =>
    beforeAffiliations
      .filter(a => {
        if (a.status !== 'active') return false
        return beforePositions.find(p => p.id === a.positionId)?.orgId === orgId
      })
      .map(a => ({
        aff:    a,
        person: persons.find(p => p.id === a.personId),
        pos:    beforePositions.find(p => p.id === a.positionId),
      }))
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  // person が allocationList 内に差分のある行を持つかどうか
  const hasChanges = (sfPersonId: string): boolean =>
    allocationList
      .filter(r => r.userId === sfPersonId)
      .some(r => rowDiff(r).length > 0)

  const getStatus = (person: { sfPersonId?: string }): 'changed' | 'unchanged' => {
    return hasChanges(person.sfPersonId ?? '') ? 'changed' : 'unchanged'
  }

  // Count changed across entire tree
  const countChanged = (orgId: string): number => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return 0
    const direct = getPersonsInOrg(orgId).filter(x => getStatus(x.person) === 'changed').length
    const children = organizations.filter(o => o.parentId === orgId).reduce((sum, c) => sum + countChanged(c.id), 0)
    return direct + children
  }

  const totalChanged = countChanged(focusedOrgId)

  const handleDragStart = (
    e: React.DragEvent, personId: string, fromOrgId: string,
    fromCompanyId: string, affiliationType: 'primary' | 'concurrent'
  ) => {
    const data: DragData = { personId, fromOrgId, fromCompanyId, affiliationType, source: 'before' }
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  // ── Person cards (before state, read-only with status) ─────────
  const renderPersonCards = (orgId: string, companyId: string) => {
    let list = getPersonsInOrg(orgId)
    if (filterMode === 'changed') {
      list = list.filter(x => getStatus(x.person) === 'changed')
    }
    if (list.length === 0) return null

    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {list.map(({ aff, person, pos }) => {
          const status       = getStatus(person)
          const isConcurrent = aff.type === 'concurrent'
          const isSelected   = selectedPersonId === person.id

          const statusBg: Record<typeof status, string> = {
            unchanged: 'bg-gray-100 border-gray-300',
            changed:   'bg-blue-50 border-blue-300',
          }
          const statusBadge: Record<typeof status, string> = {
            unchanged: '−',
            changed:   '→',
          }
          const badgeColor: Record<typeof status, string> = {
            unchanged: 'text-gray-400',
            changed:   'text-blue-500',
          }

          return (
            <div
              key={aff.id}
              draggable
              onDragStart={e => handleDragStart(e, person.id, orgId, companyId, aff.type)}
              onClick={() => selectPerson(person.id)}
              className={`relative px-2.5 py-1.5 rounded text-xs select-none cursor-grab active:cursor-grabbing transition-all hover:shadow-md border-2 ${
                isConcurrent ? 'border-dashed' : ''
              } ${statusBg[status]} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
            >
              <span className={`absolute -top-1 -right-1 text-xs leading-none ${badgeColor[status]}`}>
                {statusBadge[status]}
              </span>
              <div className="font-semibold text-gray-800 leading-tight">{person.name}</div>
              <div className="text-gray-500 leading-tight">
                {pos.title}
                {pos.band && <span className="ml-1 text-gray-600 font-medium">{pos.band}</span>}
              </div>
              {isConcurrent && <div className="text-purple-600 text-xs leading-tight">兼務</div>}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Org box (read-only, no drop zone) ──────────────────────────
  const OrgBox = ({ orgId, depth = 0 }: { orgId: string; depth?: number }) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null
    const childOrgIds = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const changed = countChanged(orgId)

    return (
      <div className={`border-2 rounded-lg ${depth === 0 ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}>
        <div className={`px-3 py-1.5 border-b text-xs font-semibold flex items-center gap-1 ${
          depth === 0 ? 'border-gray-300 text-gray-600 bg-gray-100 rounded-t-lg' : 'border-gray-200 text-gray-500 bg-gray-50 rounded-t-lg'
        }`}>
          <span className="flex-1">{org.name}</span>
          {changed > 0 && (
            <span className="text-blue-500 text-xs font-normal">→ {changed}</span>
          )}
        </div>
        <div className="p-2">
          {renderPersonCards(orgId, org.companyId)}
          {childOrgIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {childOrgIds.map(id => <CollapsedChip key={id} orgId={id} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  const CollapsedChip = ({ orgId }: { orgId: string }) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null
    const personsInOrg = getPersonsInOrg(orgId)
    const childOrgIds  = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isExpanded   = expandedChipIds.has(orgId)
    const changed      = countChanged(orgId)

    const toggle = () => setExpandedChipIds(prev => {
      const s = new Set(prev); s.has(orgId) ? s.delete(orgId) : s.add(orgId); return s
    })

    if (!isExpanded) {
      return (
        <div
          className="flex items-center gap-1.5 border border-gray-200 rounded px-2 py-1 text-xs cursor-pointer bg-white hover:bg-gray-50 select-none"
          onClick={toggle}
        >
          <span className="text-gray-400">▸</span>
          <span className="font-medium text-gray-700 truncate flex-1">{org.name}</span>
          {personsInOrg.length > 0 && <span className="text-gray-400">{personsInOrg.length}名</span>}
          {childOrgIds.length > 0 && <span className="text-gray-400">{childOrgIds.length}組織</span>}
          {changed > 0 && <span className="text-blue-500">→{changed}</span>}
        </div>
      )
    }

    return (
      <div className="border-2 border-gray-200 rounded-lg bg-white">
        <div className="px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 flex items-center gap-1" onClick={toggle}>
          <span className="text-gray-400">▾</span>
          <span className="flex-1">{org.name}</span>
          {changed > 0 && <span className="text-blue-500 font-normal">→ {changed}</span>}
        </div>
        <div className="p-2">
          {renderPersonCards(orgId, org.companyId)}
          {childOrgIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {childOrgIds.map(id => <CollapsedChip key={id} orgId={id} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        {parentOrg && (
          <>
            <button onClick={() => focusOrg(parentOrg.id)} className="text-xs text-gray-500 hover:text-blue-600">← 上の組織へ</button>
            <span className="text-gray-300">|</span>
          </>
        )}
        <div className="flex items-center gap-1 text-xs">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-400">&gt;</span>}
              <button onClick={() => focusOrg(crumb.id)} className={`hover:text-blue-600 ${i === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {totalChanged > 0 && (
            <span className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              → 変更あり {totalChanged}名
            </span>
          )}
          <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['all', 'changed'] as FilterMode[]).map(m => (
              <button key={m} onClick={() => setFilterMode(m)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${filterMode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m === 'all' ? '全員' : '変更ありのみ'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 px-4 py-1 border-b border-gray-100 bg-gray-50 flex items-center gap-3 text-xs text-gray-500">
        <span className="text-gray-400 font-medium">− 変更なし</span>
        <span className="text-blue-500 font-medium">→ 変更あり</span>
        <span className="ml-auto text-gray-400">発令前の状態 (参照用)</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto p-4">
        {childOrgs.length === 0 ? (
          <OrgBox orgId={focusedOrgId} depth={0} />
        ) : (
          <div className="border-2 border-gray-300 rounded-lg bg-gray-50">
            <div className="px-3 py-2 border-b border-gray-300 bg-gray-100 rounded-t-lg flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 flex-1">{focusedOrg.name}</span>
              {totalChanged > 0 && <span className="text-xs text-blue-500">→ {totalChanged}</span>}
            </div>
            <div className="px-3 py-2">
              {renderPersonCards(focusedOrgId, focusedOrg.companyId)}
            </div>
            <div className="px-3 pb-3 grid grid-cols-2 gap-3">
              {childOrgs.map(c => <OrgBox key={c.id} orgId={c.id} depth={0} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
