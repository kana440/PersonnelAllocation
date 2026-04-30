import React from 'react'
import { useStore } from '../store/useStore'
import type { Organization } from '../types/domain'

export function OrgPanel() {
  const {
    companies, organizations, persons,
    beforeAffiliations, beforePositions,
    afterAffiliations, afterPositions,
    selectedPersonId, overviewViewMode,
    selectPerson, setOverviewViewMode,
  } = useStore()

  const focusedCompanyId = 'comp_a'
  const isBefore = overviewViewMode === 'before'
  const viewAffs = isBefore ? beforeAffiliations : afterAffiliations
  const viewPos = isBefore ? beforePositions : afterPositions

  const companyOrgs = organizations.filter(o => o.companyId === focusedCompanyId)

  // Detect change status for a person in a specific company
  const getChangeStatus = (personId: string, companyId: string): 'new' | 'ended' | 'changed' | null => {
    const findAff = (affs: typeof beforeAffiliations, positions: typeof beforePositions) =>
      affs.find(a => {
        if (a.personId !== personId || a.status !== 'active') return false
        const pos = positions.find(p => p.id === a.positionId)
        return pos?.companyId === companyId
      })
    const bAff = findAff(beforeAffiliations, beforePositions)
    const aAff = findAff(afterAffiliations, afterPositions)
    if (!bAff && aAff) return 'new'
    if (bAff && !aAff) return 'ended'
    if (bAff && aAff) {
      const bPos = beforePositions.find(p => p.id === bAff.positionId)
      const aPos = afterPositions.find(p => p.id === aAff.positionId)
      if (bPos?.orgId !== aPos?.orgId || bPos?.band !== aPos?.band || bPos?.title !== aPos?.title) return 'changed'
    }
    return null
  }

  const getPersonsInOrg = (orgId: string) =>
    viewAffs
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = viewPos.find(p => p.id === a.positionId)
        return pos?.orgId === orgId
      })
      .map(a => {
        const person = persons.find(p => p.id === a.personId)
        const pos = viewPos.find(p => p.id === a.positionId)
        const companyId = pos?.companyId ?? ''
        return { aff: a, person, pos, companyId }
      })
      .filter(x => x.person && x.pos)

  const CHANGE_BADGE: Record<string, string> = {
    new: 'bg-green-500',
    ended: 'bg-red-500',
    changed: 'bg-yellow-400',
  }

  const renderOrg = (org: Organization, depth: number): React.ReactNode => {
    const peopleInOrg = getPersonsInOrg(org.id)
    const children = companyOrgs.filter(o => o.parentId === org.id)

    const childrenNodes = children.map(child => renderOrg(child, depth + 1)).filter(Boolean)
    if (peopleInOrg.length === 0 && childrenNodes.length === 0) return null

    return (
      <div key={org.id} className={depth > 0 ? 'ml-3 mt-1' : 'mt-1'}>
        <div className="border border-gray-200 rounded bg-white">
          <div className={`px-2 py-1 border-b border-gray-100 text-xs font-semibold text-gray-600 ${
            depth === 0 ? 'bg-gray-100' : depth === 1 ? 'bg-gray-50' : 'bg-white'
          }`}>
            {org.name}
          </div>
          {peopleInOrg.length > 0 && (
            <div className="p-1.5 flex flex-wrap gap-1">
              {peopleInOrg.map(({ aff, person, pos, companyId }) => {
                const changeStatus = getChangeStatus(person!.id, companyId)
                const isConcurrent = aff.type === 'concurrent'
                return (
                  <button
                    key={aff.id}
                    onClick={() => selectPerson(person!.id)}
                    className={`
                      relative text-left px-2 py-1 rounded text-xs transition-all
                      ${isConcurrent
                        ? 'border border-dashed border-purple-400 bg-purple-50 hover:bg-purple-100'
                        : 'border border-blue-300 bg-blue-50 hover:bg-blue-100'}
                      ${selectedPersonId === person!.id ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}
                    `}
                  >
                    {changeStatus && (
                      <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${CHANGE_BADGE[changeStatus]}`} />
                    )}
                    <div className="font-medium text-gray-800 leading-tight">{person!.name}</div>
                    <div className="text-gray-500 leading-tight">
                      {pos!.title}
                      {pos!.band && <span className="ml-1 text-blue-600">{pos!.band}</span>}
                    </div>
                    {isConcurrent && <div className="text-purple-600 text-xs leading-tight">兼務</div>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {childrenNodes}
      </div>
    )
  }

  const rootOrgs = companyOrgs.filter(o => o.parentId === null)

  return (
    <div className="flex flex-col h-full">
      {/* Before/After toggle */}
      <div className="flex gap-1 mb-2 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setOverviewViewMode('before')}
          className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
            isBefore ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          発令前
        </button>
        <button
          onClick={() => setOverviewViewMode('after')}
          className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
            !isBefore ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          発令後
        </button>
      </div>

      {/* Company tabs */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {companies.map(c => (
          <button
            key={c.id}
            onClick={() => { void c.id }}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              focusedCompanyId === c.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {c.name}
            {!c.hasSF && <span className="ml-0.5 opacity-60">*</span>}
          </button>
        ))}
      </div>

      {/* Org tree */}
      <div className="flex-1 overflow-y-auto">
        {rootOrgs.map(org => renderOrg(org, 0))}
      </div>

      {/* Legend */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
        <span><span className="inline-block w-2.5 h-2.5 border border-blue-300 bg-blue-50 rounded mr-1 align-middle"></span>本務</span>
        <span><span className="inline-block w-2.5 h-2.5 border border-dashed border-purple-400 bg-purple-50 rounded mr-1 align-middle"></span>兼務</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 mr-1 align-middle"></span>変更</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1 align-middle"></span>新規</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1 align-middle"></span>終了</span>
      </div>
    </div>
  )
}
