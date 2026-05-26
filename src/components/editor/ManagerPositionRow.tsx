import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { AllocationRow } from '../../domain/allocationRow'
import type { ValidationIssue } from '../../domain/validation/validateRow'

interface Props {
  label:    string
  value:    string
  prevVal:  string
  allRows:  AllocationRow[]
  issues:   ValidationIssue[]
  readOnly: boolean
  onChange: (posCode: string, managerName: string) => void
}

export function ManagerPositionRow({ label, value, prevVal, allRows, issues, readOnly, onChange }: Props) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const inputRef     = useRef<HTMLInputElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})

  const persons = allRows.filter(r => r.positionCode && r.userId)

  const currentMgr  = allRows.find(r => r.positionCode === value)
  const displayName = currentMgr
    ? [currentMgr.lastName, currentMgr.firstName].filter(Boolean).join(' ')
    : value

  const q = search.trim()
  const filtered = q
    ? persons.filter(r => {
        const name = `${r.lastName ?? ''}${r.firstName ?? ''}`
        return name.includes(q) || (r.positionCode ?? '').includes(q)
      })
    : persons

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return
    const rect  = inputRef.current.getBoundingClientRect()
    const maxH  = 200
    const below = window.innerHeight - rect.bottom
    const width = Math.max(rect.width, 180)
    if (below >= maxH || rect.top < maxH) {
      setDropStyle({ top: rect.bottom + 2, left: rect.left, width })
    } else {
      setDropStyle({ bottom: window.innerHeight - rect.top + 2, left: rect.left, width })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        !containerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const select = (r: AllocationRow) => {
    const name = [r.lastName, r.firstName].filter(Boolean).join(', ')
    onChange(r.positionCode ?? '', name)
    setOpen(false)
    setSearch('')
  }

  const hasError   = issues.some(i => i.level === 'error')
  const hasWarning = issues.some(i => i.level === 'warning')
  const hasDiff    = value !== prevVal
  const rowBg      = hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : hasDiff ? 'bg-blue-50' : ''
  const borderCls  = hasError
    ? 'border-red-400 focus:ring-red-300'
    : hasWarning
    ? 'border-orange-400 focus:ring-orange-300'
    : 'border-gray-300 focus:ring-blue-300'
  const inputCls = `w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
    readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
  } ${borderCls}`

  return (
    <div className={`grid grid-cols-[8rem_1fr_1fr] gap-x-2 items-start px-3 py-1.5 border-b border-gray-100 ${rowBg}`}>
      <div className="text-xs text-gray-500 leading-5 truncate pt-0.5">{label}</div>
      <div className="space-y-0.5">
        <div ref={containerRef} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={open ? search : displayName}
            placeholder={readOnly ? '' : '名前で検索…'}
            disabled={readOnly}
            className={inputCls}
            onFocus={() => { if (!readOnly) { setOpen(true); setSearch('') } }}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch('') }
            }}
          />

          {open && filtered.length > 0 && (
            <div
              ref={dropdownRef}
              className="fixed z-[9999] bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto"
              style={dropStyle}
            >
              {filtered.map(r => {
                const name = [r.lastName, r.firstName].filter(Boolean).join(' ')
                return (
                  <button
                    key={r.rowId}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); select(r) }}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2 ${
                      r.positionCode === value ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'
                    }`}
                  >
                    <span className="flex-1 truncate">{name}</span>
                    <span className="flex-shrink-0 text-[10px] text-gray-400 tabular-nums">{r.positionCode}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {value && !open && (
          <div className="text-[10px] text-gray-400 tabular-nums px-1">{value}</div>
        )}

        {issues.map((issue, i) => (
          <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
            {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px] break-all">
        {prevVal || <span className="text-gray-300">—</span>}
      </div>
    </div>
  )
}
