import { useState, useMemo, useRef, useEffect } from 'react'
import { normalizeSearch } from '../../../utils/normalizeSearch'
import type { Organization } from '@personnel/domain/schemas'
import { buildOrgPath } from '@personnel/domain/rules/options/relevantOrgs'

interface OrgPickerProps {
  value:           string | null
  onChange:        (orgId: string) => void
  allOrgs:         Organization[]
  relevantOrgIds?: Set<string>
  memberCounts?:   Map<string, number>   // orgId → member count
  placeholder?:    string
  className?:      string
  /** レンダリングをトリガーするボタンの追加クラス */
  triggerClassName?: string
}

export function OrgPicker({
  value, onChange, allOrgs, relevantOrgIds, memberCounts,
  placeholder = '組織を選択…', className = '', triggerClassName = '',
}: OrgPickerProps) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const orgById = useMemo(() => new Map(allOrgs.map(o => [o.id, o])), [allOrgs])

  const selectedOrg = value ? orgById.get(value) : null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const activeOrgs = useMemo(
    () => allOrgs.filter(o => !o.isAbandoned),
    [allOrgs],
  )

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim())
    if (!q) return activeOrgs
    return activeOrgs.filter(o =>
      normalizeSearch(o.name).includes(q) ||
      normalizeSearch(o.externalCode ?? '').includes(q),
    )
  }, [activeOrgs, query])

  const relevant = useMemo(
    () => relevantOrgIds ? filtered.filter(o => relevantOrgIds.has(o.id)) : [],
    [filtered, relevantOrgIds],
  )

  const others = useMemo(
    () => relevantOrgIds ? filtered.filter(o => !relevantOrgIds.has(o.id)) : filtered,
    [filtered, relevantOrgIds],
  )

  const renderItem = (o: Organization) => {
    const count  = memberCounts?.get(o.id)
    const isSelected = o.id === value
    return (
      <button
        key={o.id}
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-100 font-semibold' : ''}`}
        onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
      >
        <span className="flex-1 truncate">{o.name}</span>
        {count !== undefined && (
          <span className="text-gray-400 flex-shrink-0">{count}人</span>
        )}
        {o.externalCode && (
          <span className="text-gray-300 flex-shrink-0 font-mono text-[10px]">{o.externalCode}</span>
        )}
      </button>
    )
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger */}
      <button
        className={`flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:border-blue-400 transition-colors truncate max-w-full ${triggerClassName}`}
        onClick={() => setOpen(o => !o)}
        title={selectedOrg ? buildOrgPath(selectedOrg.id, orgById) : placeholder}
      >
        <span className="truncate">{selectedOrg?.name ?? placeholder}</span>
        <span className="text-gray-400 flex-shrink-0">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-72 max-h-80 flex flex-col overflow-hidden">
          <div className="px-2 py-1.5 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="組織名・コードで検索…"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {relevant.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50 sticky top-0">
                  ★ このデータに関連する組織
                </div>
                {relevant.map(renderItem)}
              </>
            )}
            {others.length > 0 && (
              <>
                {relevant.length > 0 && (
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 bg-gray-50 sticky top-0">
                    全組織
                  </div>
                )}
                {others.map(renderItem)}
              </>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">該当なし</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
