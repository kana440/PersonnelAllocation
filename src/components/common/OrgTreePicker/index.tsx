import { useState, useMemo } from 'react'
import type { Organization }  from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'
import { useOrgTreeData }     from './useOrgTreeData'
import { OrgTreeNode }        from './OrgTreeNode'

interface Props {
  allOrgs:             Organization[]
  allocationList:      AllocationRow[]
  onSelect:            (orgId: string) => void
  relevantOrgIds?:     Set<string>
  alreadyAddedOrgIds?: Set<string>
}

export function OrgTreePicker({
  allOrgs, allocationList, onSelect, relevantOrgIds, alreadyAddedOrgIds = new Set(),
}: Props) {
  const [query,       setQuery]       = useState('')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  const { active, orgById, childrenOf, directCount, totalCount, roots } =
    useOrgTreeData(allOrgs, allocationList)

  const toggle = (id: string) =>
    setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const countLabel = (id: string) => {
    const total  = totalCount.get(id) ?? 0
    const direct = directCount.get(id) ?? 0
    if (total === 0) return '0人'
    return direct < total ? `${total}人（直下${direct}）` : `${total}人`
  }

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return active.filter(o =>
      o.name.toLowerCase().includes(q) || (o.externalCode ?? '').toLowerCase().includes(q),
    )
  }, [active, query])

  const highlightedOrg  = highlighted ? orgById.get(highlighted) : null
  const isAlreadyAdded  = highlighted ? alreadyAddedOrgIds.has(highlighted) : false

  const nodeProps = { expanded, highlighted, alreadyAdded: alreadyAddedOrgIds, childrenOf,
    totalCount, directCount, onToggle: toggle, onHighlight: setHighlighted, countLabel }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 検索 */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <input value={query} onChange={e => { setQuery(e.target.value); setHighlighted(null) }}
          placeholder="組織名・コードで検索…" autoFocus
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
        />
      </div>

      {/* ツリー or 検索結果 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {searchResults ? (
          searchResults.length === 0
            ? <div className="px-3 py-6 text-xs text-gray-400 text-center">該当なし</div>
            : searchResults.map(o => {
              const isAdded = alreadyAddedOrgIds.has(o.id)
              const path: string[] = []
              let cur: Organization | undefined = o
              while (cur?.parentId && orgById.has(cur.parentId)) {
                cur = orgById.get(cur.parentId)
                if (cur) path.unshift(cur.name)
              }
              return (
                <div key={o.id}
                  className={`px-3 py-1.5 cursor-pointer transition-colors
                    ${o.id === highlighted ? 'bg-blue-100' : isAdded ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}
                  onClick={() => !isAdded && setHighlighted(o.id)}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.externalCode && <span className="text-[10px] text-gray-300 font-mono">{o.externalCode}</span>}
                    <span className="text-[10px] text-gray-400 whitespace-nowrap ml-1">{countLabel(o.id)}</span>
                    {isAdded && <span className="text-[10px] text-gray-400 bg-gray-200 rounded px-1">追加済</span>}
                  </div>
                  {path.length > 0 && <div className="text-[10px] text-gray-400 truncate pl-1">{path.join(' › ')}</div>}
                </div>
              )
            })
        ) : (
          <>
            {relevantOrgIds && relevantOrgIds.size > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-600 bg-gray-100 sticky top-0 border-b border-gray-200">
                  このデータに関連する組織
                </div>
                {[...relevantOrgIds].map(id => {
                  const o = orgById.get(id)
                  if (!o) return null
                  const isAdded = alreadyAddedOrgIds.has(id)
                  return (
                    <div key={id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors text-xs
                        ${id === highlighted ? 'bg-blue-100 text-blue-700' : isAdded ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}
                      onClick={() => !isAdded && setHighlighted(id)}
                    >
                      <span className="flex-1 truncate">{o.name}</span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{countLabel(id)}</span>
                      {isAdded && <span className="text-[10px] text-gray-400 bg-gray-200 rounded px-1">追加済</span>}
                    </div>
                  )
                })}
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 bg-gray-50 sticky top-0 border-b border-gray-100">
                  その他の組織
                </div>
              </>
            )}
            {roots.map(o => <OrgTreeNode key={o.id} org={o} depth={0} {...nodeProps} />)}
          </>
        )}
      </div>

      {/* フッター確定ボタン */}
      <div className="flex-shrink-0 border-t border-gray-200 px-3 py-2.5 flex items-center gap-2 bg-gray-50">
        {highlightedOrg ? (
          <>
            <span className="flex-1 text-xs text-gray-700 truncate" title={highlightedOrg.name}>
              選択中: {highlightedOrg.name}
            </span>
            <button
              onClick={() => !isAlreadyAdded && onSelect(highlighted!)}
              disabled={isAlreadyAdded}
              className={`flex-shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isAlreadyAdded
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >{isAlreadyAdded ? '追加済み' : 'この組織を追加'}</button>
          </>
        ) : (
          <span className="text-xs text-gray-400">組織を選択してください</span>
        )}
      </div>
    </div>
  )
}
