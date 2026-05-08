import { useState } from 'react'
import { useStore } from '../store/useStore'
import { PersonDetailPanel } from './PersonDetailPanel'

export function SearchPersonPanel() {
  const {
    persons,
    afterOrganizations,
    afterAffiliations, afterPositions,
    beforeAffiliations, beforePositions,
    operations, confirmedNoChangeKeys,
    focusOrg, selectPerson, selectedPersonId,
  } = useStore()

  const [search, setSearch] = useState('')
  const searchLower = search.toLowerCase().trim()

  const activeOrgs = afterOrganizations.filter(o => !o.isAbandoned)

  const matchedOrgs = searchLower.length >= 1
    ? activeOrgs.filter(o => o.name.toLowerCase().includes(searchLower)).slice(0, 6)
    : []

  const matchedPersons = searchLower.length >= 1
    ? persons.filter(p => p.name.toLowerCase().includes(searchLower)).slice(0, 10)
    : []

  // Count unconfirmed persons in before state
  const isConfirmedOrChanged = (personId: string, companyId: string) => {
    const hasOp = operations.some(o =>
      o.params.personId === personId && (
        (o.kind === 'MoveToOrg' && o.params.companyId === companyId) ||
        (o.kind === 'Promote' && o.params.companyId === companyId) ||
        (o.kind === 'RecallFromSecondment' && o.params.companyId === companyId) ||
        o.kind === 'SendOnSecondment'
      )
    )
    return hasOp || confirmedNoChangeKeys.has(`${personId}_${companyId}`)
  }

  const unconfirmedPersonIds = [...new Set(
    beforeAffiliations
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = beforePositions.find(p => p.id === a.positionId)
        if (!pos) return false
        return !isConfirmedOrChanged(a.personId, pos.companyId)
      })
      .map(a => a.personId)
  )]

  const getAfterPosition = (personId: string) => {
    const aff = afterAffiliations.find(a => a.personId === personId && a.status === 'active' && a.type === 'primary')
    return aff ? afterPositions.find(p => p.id === aff.positionId) : null
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: search sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-2 border-b border-gray-200 bg-white">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 人物・組織を検索"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {searchLower ? (
            <div className="p-1">
              {matchedOrgs.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">組織</div>
                  {matchedOrgs.map(org => (
                    <button
                      key={org.id}
                      onClick={() => { focusOrg(org.id); setSearch('') }}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-50 text-gray-700 flex items-center gap-1.5 transition-colors"
                    >
                      <span className="text-gray-400 flex-shrink-0">🏢</span>
                      <span className="truncate">{org.name}</span>
                    </button>
                  ))}
                </>
              )}
              {matchedPersons.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide mt-1">人物</div>
                  {matchedPersons.map(p => {
                    const pos = getAfterPosition(p.id)
                    const isSelected = selectedPersonId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => { selectPerson(p.id); setSearch('') }}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors ${
                          isSelected ? 'bg-yellow-50 text-gray-800' : 'hover:bg-blue-50 text-gray-700'
                        }`}
                      >
                        <span className="text-gray-400 flex-shrink-0">👤</span>
                        <span className="truncate font-medium flex-1">{p.name}</span>
                        {pos?.band && <span className="text-gray-400 flex-shrink-0 font-normal">{pos.band}</span>}
                      </button>
                    )
                  })}
                </>
              )}
              {matchedPersons.length === 0 && matchedOrgs.length === 0 && (
                <div className="p-4 text-xs text-gray-400 text-center">該当なし</div>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {/* Summary */}
              <div className="rounded border border-gray-200 bg-white p-2.5 text-xs space-y-1">
                <div className="text-gray-500 font-medium mb-1.5">発令サマリー</div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">操作件数</span>
                  <span className="font-semibold text-gray-800">{operations.length} 件</span>
                </div>
                {unconfirmedPersonIds.length > 0 && (
                  <div className="flex items-center justify-between text-amber-600">
                    <span>⚠ 未確認</span>
                    <span className="font-semibold">{unconfirmedPersonIds.length} 名</span>
                  </div>
                )}
                {unconfirmedPersonIds.length === 0 && operations.length > 0 && (
                  <div className="text-green-600 text-xs">✓ 全員確認済み</div>
                )}
              </div>

              {/* Unconfirmed persons quick list */}
              {unconfirmedPersonIds.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                  <div className="text-amber-700 font-medium mb-1">未確認の人物</div>
                  {unconfirmedPersonIds.slice(0, 6).map(pid => {
                    const person = persons.find(p => p.id === pid)
                    return person ? (
                      <button
                        key={pid}
                        onClick={() => selectPerson(pid)}
                        className="block w-full text-left py-0.5 text-amber-800 hover:text-blue-600 truncate"
                      >
                        {person.name}
                      </button>
                    ) : null
                  })}
                  {unconfirmedPersonIds.length > 6 && (
                    <div className="text-amber-600 mt-1">他 {unconfirmedPersonIds.length - 6} 名…</div>
                  )}
                </div>
              )}

              <div className="text-xs text-gray-400 text-center py-1">
                人物名または組織名を入力して検索
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: PersonDetailPanel or placeholder */}
      <div className="flex-1 overflow-hidden min-w-0">
        {selectedPersonId ? (
          <PersonDetailPanel />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <span className="text-3xl">👤</span>
            <span className="text-sm">人物を選択してください</span>
            <span className="text-xs">組織図から人物をクリック、または左の検索欄から選択</span>
          </div>
        )}
      </div>
    </div>
  )
}
