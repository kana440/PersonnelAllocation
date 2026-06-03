import { useState, useRef } from 'react'
import type { Organization } from '../../domain/schemas'
import type { OrgMasterEntry } from '../../domain/masters/orgMaster'

interface Props {
  afterOrganizations: Organization[]
  orgMasterEntries:   OrgMasterEntry[]
  onSelect:           (code: string, entry: OrgMasterEntry | null) => void
  onClose:            () => void
}

function buildPath(orgs: Organization[], orgId: string): Set<string> {
  const path = new Set<string>([orgId])
  let cur = orgs.find(o => o.id === orgId)
  while (cur?.parentId) { path.add(cur.parentId); cur = orgs.find(o => o.id === cur!.parentId) }
  return path
}

export function OrgSearchDialog({ afterOrganizations, orgMasterEntries, onSelect, onClose }: Props) {
  const [query,       setQuery]       = useState('')
  const [expanded,    setExpanded]    = useState<Set<string>>(() => {
    const s = new Set<string>()
    const roots = afterOrganizations.filter(o => !o.parentId || !afterOrganizations.some(p => p.id === o.parentId))
    roots.forEach(r => { s.add(r.id); afterOrganizations.filter(c => c.parentId === r.id).forEach(c => s.add(c.id)) })
    return s
  })
  const [highlighted, setHighlighted] = useState<Organization | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const toggle = (id: string) => setExpanded(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  // 検索結果クリック → ツリーに戻り、その組織の経路だけ展開してハイライト
  const navigateToOrg = (org: Organization) => {
    setExpanded(buildPath(afterOrganizations, org.id))
    setHighlighted(org.externalCode ? org : null)
    setQuery('')
    requestAnimationFrame(() => requestAnimationFrame(() =>
      treeRef.current?.querySelector(`[data-org-id="${org.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    ))
  }

  const confirmSelect = () => {
    if (!highlighted?.externalCode) return
    const code  = highlighted.externalCode
    const entry = orgMasterEntries.find(e => e.code === code && e.phase === 'after')
               ?? orgMasterEntries.find(e => e.code === code)
               ?? null
    onSelect(code, entry)
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? afterOrganizations.filter(o =>
    !o.isAbandoned && (o.name.toLowerCase().includes(q) || (o.externalCode ?? '').toLowerCase().includes(q))
  ) : null

  const renderNode = (org: Organization, depth: number): React.ReactNode => {
    const children   = afterOrganizations.filter(o => o.parentId === org.id && !o.isAbandoned)
    const isExpanded = expanded.has(org.id)
    const hasCode    = !!org.externalCode && !org.isAbandoned
    const isSelected = highlighted?.id === org.id

    return (
      <div key={org.id}>
        <div
          data-org-id={org.id}
          onClick={() => { toggle(org.id); if (hasCode) setHighlighted(org) }}
          className={`flex items-center gap-0.5 rounded cursor-pointer select-none ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <span className="w-4 h-4 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          <span className={`flex-1 text-xs py-1 px-1 truncate ${isSelected ? 'text-blue-700 font-medium' : hasCode ? 'text-gray-700' : 'text-gray-400'}`}>
            {org.name}
            {org.externalCode && (
              <span className={`ml-1.5 text-[10px] font-mono ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                {org.externalCode}
              </span>
            )}
          </span>
        </div>
        {isExpanded && children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const roots = afterOrganizations.filter(
    o => !o.isAbandoned && (!o.parentId || !afterOrganizations.some(p => p.id === o.parentId))
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
           onMouseDown={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            組織を選択　<span className="font-normal text-gray-400">（クリック：開閉／ハイライト　→「選択」で確定）</span>
          </p>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="組織名・コードで絞り込み → クリックでツリーに移動"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>

        <div ref={treeRef} className="overflow-y-auto flex-1 py-1">
          {filtered ? (
            filtered.length === 0
              ? <div className="text-xs text-gray-400 text-center py-8">該当なし</div>
              : filtered.map(org => (
                  <div key={org.id} onClick={() => navigateToOrg(org)}
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-blue-50 select-none">
                    <span className="text-gray-400 text-xs flex-shrink-0">🏢</span>
                    <span className="text-xs font-mono text-blue-700 font-semibold flex-shrink-0">{org.externalCode ?? '—'}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate">{org.name}</span>
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
            disabled={!highlighted?.externalCode}
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {highlighted?.externalCode ? `「${highlighted.name}」を選択` : '選択'}
          </button>
        </div>
      </div>
    </div>
  )
}
