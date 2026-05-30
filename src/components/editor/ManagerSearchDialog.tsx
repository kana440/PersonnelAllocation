import { useState, useMemo, useRef } from 'react'
import type { Organization } from '../../domain/schemas'
import type { AllocationRow } from '../../domain/allocationRow'

interface Props {
  afterOrganizations: Organization[]
  allocationList:     AllocationRow[]
  onSelect:           (posCode: string, managerName: string) => void
  onClose:            () => void
}

function buildPath(orgs: Organization[], orgId: string): Set<string> {
  const path = new Set<string>([orgId])
  let cur = orgs.find(o => o.id === orgId)
  while (cur?.parentId) { path.add(cur.parentId); cur = orgs.find(o => o.id === cur!.parentId) }
  return path
}

export function ManagerSearchDialog({ afterOrganizations, allocationList, onSelect, onClose }: Props) {
  const [query,       setQuery]       = useState('')
  const [expanded,    setExpanded]    = useState<Set<string>>(() => {
    const s = new Set<string>()
    const roots = afterOrganizations.filter(o => !o.parentId || !afterOrganizations.some(p => p.id === o.parentId))
    roots.forEach(r => { s.add(r.id); afterOrganizations.filter(c => c.parentId === r.id).forEach(c => s.add(c.id)) })
    return s
  })
  const [highlighted, setHighlighted] = useState<AllocationRow | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const toggle = (id: string) => setExpanded(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  const orgByCode = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations]
  )
  const membersByOrgId = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.positionCode || !row.userId || !row.departmentCode) continue
      const org = orgByCode.get(row.departmentCode)
      if (!org) continue
      const arr = map.get(org.id) ?? []; arr.push(row); map.set(org.id, arr)
    }
    return map
  }, [allocationList, orgByCode])

  // 組織クリック（検索結果 or ツリー外）→ その組織の経路だけ展開してツリーに戻る
  const navigateToOrg = (org: Organization) => {
    setExpanded(buildPath(afterOrganizations, org.id))
    setQuery('')
    requestAnimationFrame(() => requestAnimationFrame(() =>
      treeRef.current?.querySelector(`[data-org-id="${org.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    ))
  }

  // 人クリック（検索結果）→ 所属組織の経路を展開、その人をハイライト
  const navigateToRow = (row: AllocationRow) => {
    const org = orgByCode.get(row.departmentCode ?? '')
    if (org) setExpanded(buildPath(afterOrganizations, org.id))
    setHighlighted(row)
    setQuery('')
    requestAnimationFrame(() => requestAnimationFrame(() =>
      treeRef.current?.querySelector(`[data-row-id="${row.rowId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    ))
  }

  const confirmSelect = () => {
    if (!highlighted) return
    const name = [highlighted.lastName, highlighted.firstName].filter(Boolean).join(' ')
    onSelect(highlighted.positionCode ?? '', name)
  }

  const q = query.trim().toLowerCase()

  // 組織・人の混合検索（NavBar と同じ形式）
  type SearchItem =
    | { kind: 'org';    org: Organization }
    | { kind: 'person'; row: AllocationRow }

  const searchResults: SearchItem[] | null = q ? [
    ...afterOrganizations
      .filter(o => !o.isAbandoned && (o.name.toLowerCase().includes(q) || (o.externalCode ?? '').toLowerCase().includes(q)))
      .map(o => ({ kind: 'org' as const, org: o })),
    ...allocationList
      .filter(r => {
        if (!r.positionCode || !r.userId) return false
        const name = `${r.lastName ?? ''}${r.firstName ?? ''}`.toLowerCase()
        return name.includes(q) || (r.positionCode ?? '').toLowerCase().includes(q)
      })
      .map(r => ({ kind: 'person' as const, row: r })),
  ] : null

  const renderPersonRow = (row: AllocationRow, depth: number) => {
    const name       = [row.lastName, row.firstName].filter(Boolean).join(' ')
    const isSelected = highlighted?.rowId === row.rowId
    return (
      <div
        key={row.rowId}
        data-row-id={row.rowId}
        onClick={() => setHighlighted(row)}
        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer select-none ${isSelected ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
        style={{ paddingLeft: `${depth * 12 + 24}px` }}
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
          {name.charAt(0)}
        </div>
        <span className={`text-xs flex-1 truncate ${isSelected ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>{name}</span>
        <span className={`text-[10px] font-mono flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>{row.positionCode}</span>
      </div>
    )
  }

  const renderNode = (org: Organization, depth: number): React.ReactNode => {
    const children   = afterOrganizations.filter(o => o.parentId === org.id && !o.isAbandoned)
    const members    = membersByOrgId.get(org.id) ?? []
    const isExpanded = expanded.has(org.id)
    const hasContent = children.length > 0 || members.length > 0

    return (
      <div key={org.id}>
        <div
          data-org-id={org.id}
          onClick={() => hasContent && toggle(org.id)}
          className={`flex items-center gap-0.5 rounded select-none ${hasContent ? 'cursor-pointer hover:bg-gray-50' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <span className="w-4 h-4 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
            {hasContent ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          <span className="text-xs py-1 text-gray-500 font-medium truncate">{org.name}</span>
          {members.length > 0 && <span className="text-[10px] text-gray-400 ml-1">{members.length}</span>}
        </div>
        {isExpanded && (
          <>
            {members.map(row => renderPersonRow(row, depth))}
            {children.map(c => renderNode(c, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const roots = afterOrganizations.filter(
    o => !o.isAbandoned && (!o.parentId || !afterOrganizations.some(p => p.id === o.parentId))
  )
  const highlightedName = highlighted ? [highlighted.lastName, highlighted.firstName].filter(Boolean).join(' ') : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
           onMouseDown={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            上司を選択　<span className="font-normal text-gray-400">（人をクリックで選択 → 「選択」で確定）</span>
          </p>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="組織名・コード・氏名・ポジションコードで絞り込み"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>

        <div ref={treeRef} className="overflow-y-auto flex-1 py-1">
          {searchResults ? (
            searchResults.length === 0
              ? <div className="text-xs text-gray-400 text-center py-8">該当なし</div>
              : searchResults.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => item.kind === 'org' ? navigateToOrg(item.org) : navigateToRow(item.row)}
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-blue-50 select-none"
                  >
                    <span className="text-gray-400 text-xs flex-shrink-0">{item.kind === 'org' ? '🏢' : '👤'}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate font-medium">
                      {item.kind === 'org'
                        ? item.org.name
                        : [item.row.lastName, item.row.firstName].filter(Boolean).join(' ')}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {item.kind === 'org' ? (item.org.externalCode ?? '') : item.row.positionCode}
                    </span>
                  </div>
                ))
          ) : (
            roots.map(org => renderNode(org, 0))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
          <button
            onClick={confirmSelect}
            disabled={!highlighted}
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {highlightedName ? `「${highlightedName}」を選択` : '選択'}
          </button>
        </div>
      </div>
    </div>
  )
}
