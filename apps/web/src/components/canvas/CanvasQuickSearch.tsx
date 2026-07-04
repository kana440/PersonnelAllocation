import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore }             from '../../store/useStore'
import { useCanvasPanelNav }    from '../layout/OrgPersonNav/useCanvasPanelNav'
import { buildOrgPathMap }      from '../review/components/BulkFieldEditModal/helpers'
import { normalizeSearch, normalizeName } from '../../utils/normalizeSearch'

type OrgCandidate    = { kind: 'org';    orgId: string; name: string; code: string; pathLabel: string }
type PersonCandidate = { kind: 'person'; rowId: number; orgId: string; name: string; userId: string }
type Candidate = OrgCandidate | PersonCandidate

const MAX_ORG = 6; const MAX_PERSON = 8

export function CanvasQuickSearch() {
  const afterOrganizations = useStore(s => s.afterOrganizations)
  const allocationList     = useStore(s => s.allocationList)
  const { handleOrgClick, handlePersonClick } = useCanvasPanelNav(afterOrganizations, () => {})

  const [query,    setQuery]    = useState('')
  const [isOpen,   setIsOpen]   = useState(false)
  const [debounced, setDebounced] = useState('')
  const inputRef     = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 150ms デバウンス
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150)
    return () => clearTimeout(t)
  }, [query])

  // デバウンス後に isOpen を更新
  useEffect(() => {
    setIsOpen(debounced.length > 0)
  }, [debounced])

  // クリック外で閉じる
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const orgPathMap = useMemo(() => buildOrgPathMap(afterOrganizations), [afterOrganizations])

  const afterOrgByCode = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )

  const candidates = useMemo((): Candidate[] => {
    if (!debounced) return []
    const q     = normalizeSearch(debounced)
    const qName = normalizeName(debounced)
    const results: Candidate[] = []

    let orgCount = 0
    for (const org of afterOrganizations) {
      if (orgCount >= MAX_ORG) break
      if (org.isAbandoned) continue
      const nameN = normalizeSearch(org.name)
      const codeN = normalizeSearch(org.externalCode ?? '')
      const pathN = normalizeSearch(orgPathMap.get(org.externalCode ?? '') ?? '')
      if (nameN.includes(q) || codeN.includes(q) || pathN.includes(q)) {
        const path = orgPathMap.get(org.externalCode ?? '') ?? ''
        results.push({ kind: 'org', orgId: org.id, name: org.name, code: org.externalCode ?? '', pathLabel: path })
        orgCount++
      }
    }

    let personCount = 0
    for (const row of allocationList) {
      if (personCount >= MAX_PERSON) break
      if (!row.userId && !row.lastName) continue
      const fullName = normalizeName([row.lastName, row.firstName].filter(Boolean).join(''))
      const kana     = normalizeName([row.lastNameKana, row.firstNameKana].filter(Boolean).join(''))
      const userId   = normalizeSearch(row.userId ?? '')
      if (fullName.includes(qName) || kana.includes(qName) || userId.includes(q)) {
        const org  = row.departmentCode ? afterOrgByCode.get(String(row.departmentCode)) : undefined
        const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || `#${row.rowId}`
        results.push({ kind: 'person', rowId: row.rowId, orgId: org?.id ?? '', name, userId: row.userId ?? '' })
        personCount++
      }
    }

    return results
  }, [debounced, afterOrganizations, allocationList, orgPathMap, afterOrgByCode])

  const handleSelect = (c: Candidate) => {
    if (c.kind === 'org') handleOrgClick(c.orgId)
    else                  handlePersonClick(c.rowId, c.orgId)
    setQuery('')
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setQuery(''); setIsOpen(false); inputRef.current?.blur(); return }
    if (e.key === 'Enter') {
      // 候補が1件のときだけ自動確定。複数あればドロップダウンを維持して選ばせる
      if (candidates.length === 1) { handleSelect(candidates[0]); return }
      if (candidates.length > 1)   { setIsOpen(true) }
    }
  }

  return (
    <div ref={containerRef} className="relative flex-shrink-0 w-52">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px] pointer-events-none select-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) setIsOpen(false) }}
          onFocus={() => { if (debounced) setIsOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder="組織・氏名・社員IDで検索"
          className="w-full text-[11px] border border-gray-300 rounded pl-6 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white"
        />
        {query && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus() }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs leading-none"
          >✕</button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg z-50 overflow-hidden max-h-72 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-gray-400">一致なし</div>
          ) : (
            <>
              {candidates.length > 1 && (
                <div className="px-2 py-1 text-[9px] text-gray-400 border-b border-gray-50">
                  {candidates.length}件 — クリックで移動（Enter で先頭1件に移動）
                </div>
              )}
              {candidates.map((c, i) => (
                <button
                  key={i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0"
                >
                  <span className="flex-shrink-0 text-sm">{c.kind === 'org' ? '🏢' : '👤'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-gray-800 font-medium truncate">{c.name}</div>
                    <div className="text-[9px] text-gray-400 truncate">
                      {c.kind === 'org' ? (c.pathLabel || c.code) : c.userId}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
