import { useState, useMemo } from 'react'
import { normalizeSearch } from '../../../utils/normalizeSearch'
import type { MemberInfo }    from './useStripCardData'
import type { DragData }      from '../OrgViewContext'
import type { Organization }  from '@personnel/domain/schemas'

interface Props {
  allMembers:   MemberInfo[]
  currentOrgId: string
  panelOrgId:   string
  /** childrenOf から BFS してサブツリーメンバーを絞り込む（O(subtree) にするため）*/
  childrenOf:   Map<string, Organization[]>
}

const MAX_CHIPS = 10

export function PanelChips({ allMembers, currentOrgId, panelOrgId, childrenOf }: Props) {
  const [query, setQuery] = useState('')

  // currentOrgId の直属メンバー
  const directMembers = useMemo(
    () => allMembers.filter(m => m.subOrgId === currentOrgId),
    [allMembers, currentOrgId],
  )

  // childrenOf を使った O(subtree) BFS でサブツリー内 org ID を収集
  const subtreeOrgIds = useMemo(() => {
    const ids   = new Set<string>()
    const queue = [currentOrgId]
    while (queue.length) {
      const id = queue.shift()!
      ids.add(id)
      for (const c of childrenOf.get(id) ?? []) queue.push(c.id)
    }
    return ids
  }, [currentOrgId, childrenOf])

  const subtreeMembers = useMemo(
    () => allMembers.filter(m => subtreeOrgIds.has(m.subOrgId)),
    [allMembers, subtreeOrgIds],
  )

  const visibleSearch = useMemo(() => {
    if (!query) return []
    const q = normalizeSearch(query)
    return subtreeMembers.filter(m => normalizeSearch(m.person.name).includes(q))
  }, [subtreeMembers, query])

  const directCount   = directMembers.length
  const totalCount    = subtreeMembers.length
  const defaultChips  = directMembers.slice(0, MAX_CHIPS)
  const directOverflow = Math.max(0, directCount - MAX_CHIPS)
  const hasDescendants = totalCount > directCount

  return (
    <div>
      {/* 検索バー */}
      <div className="px-2 pb-1 flex items-center gap-1">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="名前で絞り込み…"
          className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400"
          onClick={e => e.stopPropagation()}
        />
        {query && (
          <button
            onClick={e => { e.stopPropagation(); setQuery('') }}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0"
          >✕</button>
        )}
      </div>

      {/* チップ */}
      <div className="px-2 pb-1.5 flex flex-wrap gap-0.5">
        {query ? (
          visibleSearch.length > 0
            ? visibleSearch.map(m => <Chip key={m.row.rowId} member={m} panelOrgId={panelOrgId} />)
            : <span className="text-[10px] text-gray-300 italic">該当なし</span>
        ) : (
          <>
            {defaultChips.map(m => <Chip key={m.row.rowId} member={m} panelOrgId={panelOrgId} />)}
            {directOverflow > 0 && (
              <span className="text-[10px] text-gray-400 self-center">+{directOverflow}人</span>
            )}
            {hasDescendants && (
              <span className="text-[10px] text-blue-300 self-center" title="配下組織を含む">
                ＋配下{totalCount - directCount}人
              </span>
            )}
            {totalCount === 0 && (
              <span className="text-[10px] text-gray-300 italic">（空）</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface ChipProps { member: MemberInfo; panelOrgId: string }

function Chip({ member, panelOrgId }: ChipProps) {
  const { row, person, isDirect } = member
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    const data: DragData = {
      dragType: 'position', personId: person.id,
      fromOrgId: panelOrgId, fromCompanyId: '',
      affiliationType: 'primary',
      fromRowId: row.rowId, rowId: row.rowId,
      fromPanelId: `panel_${panelOrgId}`,
    }
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.setData('application/x-position-drag', '')
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <span
      draggable onDragStart={onDragStart}
      className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] cursor-grab active:cursor-grabbing max-w-[68px] truncate
        ${isDirect ? 'bg-gray-100 text-gray-600 hover:bg-blue-100' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}
      title={person.name}
    >
      {person.name || '?'}
    </span>
  )
}
