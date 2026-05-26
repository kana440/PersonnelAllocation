import { useState, useMemo, useRef, useEffect } from 'react'
import type { Organization } from '../../domain/schemas'

interface Props {
  allOrgs:      Organization[]
  value:        string | null
  onChange:     (id: string | null) => void
  placeholder?: string
  allowClear?:  boolean
  className?:   string
  variant?:     'dark' | 'light'   // trigger button style
}

export function OrgCombobox({
  allOrgs, value, onChange,
  placeholder = '組織を選択…',
  allowClear = false,
  className = '',
  variant = 'dark',
}: Props) {
  const [open,              setOpen]              = useState(false)
  const [search,            setSearch]            = useState('')
  const [expandedOrgs,      setExpandedOrgs]      = useState<Set<string>>(() => new Set())
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    () => new Set(allOrgs.map(o => o.companyId).filter(Boolean) as string[])
  )

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  const orgById  = useMemo(() => new Map(allOrgs.map(o => [o.id, o])), [allOrgs])
  const viewOrgs = useMemo(() => allOrgs.filter(o => !o.isAbandoned), [allOrgs])
  const selectedOrg = value ? (orgById.get(value) ?? null) : null

  const allCompanies = useMemo(
    () => [...new Set(viewOrgs.map(o => o.companyId))].filter(Boolean) as string[],
    [viewOrgs]
  )

  // When opening, auto-expand to reveal the currently selected org
  const openPicker = () => {
    if (value) {
      const sel = orgById.get(value)
      if (sel) {
        if (sel.companyId)
          setExpandedCompanies(prev => { const s = new Set(prev); s.add(sel.companyId!); return s })
        const toExpand: string[] = []
        let cur: Organization | undefined = sel
        while (cur) {
          toExpand.push(cur.id)
          cur = cur.parentId ? orgById.get(cur.parentId) : undefined
        }
        setExpandedOrgs(prev => { const s = new Set(prev); for (const id of toExpand) s.add(id); return s })
      }
    }
    setOpen(true)
    setSearch('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (id: string | null) => { onChange(id); setOpen(false); setSearch('') }
  const toggleOrg     = (id: string) => setExpandedOrgs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleCompany = (id: string) => setExpandedCompanies(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const searchLower  = search.trim().toLowerCase()
  const searchResults = searchLower
    ? viewOrgs.filter(o => o.name.toLowerCase().includes(searchLower)).slice(0, 60)
    : null

  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children   = viewOrgs.filter(o => o.parentId === org.id)
    const isExpanded = expandedOrgs.has(org.id)
    const isSelected = value === org.id
    return (
      <div key={org.id} style={{ marginLeft: `${depth * 10}px` }}>
        <div className={`flex items-center gap-0.5 rounded py-0.5 px-1 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleOrg(org.id)}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs"
          >
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : <span className="w-4" />}
          </button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => select(org.id)}
            className={`flex-1 text-left text-xs py-0.5 flex items-center gap-1 min-w-0 ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700 hover:text-blue-600'}`}
          >
            <span className="flex-1 truncate">{org.name}</span>
            {org.externalCode && (
              <span className="flex-shrink-0 text-[10px] font-normal tabular-nums text-gray-400">{org.externalCode}</span>
            )}
          </button>
        </div>
        {isExpanded && children.map(c => renderOrgNode(c, depth + 1))}
      </div>
    )
  }

  const triggerCls = variant === 'dark'
    ? 'w-full text-left bg-gray-700 text-white text-xs px-2 py-0.5 rounded border border-gray-600 hover:border-blue-400 focus:outline-none flex items-center gap-1 min-w-0'
    : 'w-full text-left bg-white text-gray-800 text-xs px-2 py-1.5 rounded border border-gray-300 hover:border-blue-400 focus:outline-none flex items-center gap-1 min-w-0'

  return (
    <div className={`relative ${className}`}>
      <button ref={triggerRef} onClick={openPicker} className={triggerCls}>
        {selectedOrg
          ? <span className="truncate flex-1">{selectedOrg.name}</span>
          : <span className="truncate flex-1 text-gray-400">{placeholder}</span>
        }
        <span className="flex-shrink-0 text-xs text-gray-400">▾</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 z-50 mt-0.5 bg-white border border-gray-200 rounded shadow-xl flex flex-col"
          style={{ width: 'max(280px, 100%)', maxHeight: '380px' }}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100 flex-shrink-0">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 組織を検索"
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Tree / Search results */}
          <div className="flex-1 overflow-y-auto min-h-0 px-1 py-1">
            {allowClear && (
              <button
                onClick={() => select(null)}
                className={`w-full text-left px-2 py-1 rounded text-xs mb-1 border-b border-gray-100 pb-2 ${!value ? 'text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                全件（全社）
              </button>
            )}

            {searchResults ? (
              searchResults.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3">該当なし</div>
              ) : (
                searchResults.map(org => {
                  const parent = org.parentId ? orgById.get(org.parentId) : null
                  return (
                    <button
                      key={org.id}
                      onClick={() => select(org.id)}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 ${value === org.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-blue-50'}`}
                    >
                      <span className="flex-1 truncate">{org.name}</span>
                      {org.externalCode && <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{org.externalCode}</span>}
                      {parent && <span className="text-gray-300 flex-shrink-0 text-[10px] truncate max-w-[70px]">{parent.name}</span>}
                    </button>
                  )
                })
              )
            ) : (
              allCompanies.map(companyId => {
                const rootOrgs = viewOrgs.filter(o => o.companyId === companyId && !o.parentId)
                if (rootOrgs.length === 0) return null
                const isOpen = expandedCompanies.has(companyId)
                return (
                  <div key={companyId} className="border border-gray-200 rounded mb-1">
                    <button
                      onClick={() => toggleCompany(companyId)}
                      className="w-full flex items-center justify-between px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded transition-colors"
                    >
                      <span className="truncate">{companyId}</span>
                      <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-1 py-0.5">
                        {rootOrgs.map(org => renderOrgNode(org, 0))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
