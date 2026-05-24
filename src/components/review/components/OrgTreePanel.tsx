/**
 * OrgTreePanel — 検索 + 折りたたみ可能な組織ツリー（レビュー領域の共通コンポーネント）
 *
 * 開発ポリシー:
 *   - レビュー系のコンポーネントで「組織一覧 + 検索」が必要な場合はこのコンポーネントを使う
 *   - 同じパターンをコピーして別コンポーネントを作らない
 *   - サイドバーの OrgSearchSidebar はドラッグ・人物選択など固有機能が多いため対象外
 *   - renderOrgRow に追加コンテンツ（マッチ表示など）を注入できる
 */
import { useState, useMemo } from 'react'
import type { Organization } from '../../../domain/schemas'

interface Props {
  orgs:          Organization[]
  selectedId?:   string
  onSelectOrg:   (id: string) => void
  renderOrgRow?: (org: Organization) => React.ReactNode  // 行末に追加コンテンツを注入
  placeholder?:  string
  emptyMessage?: string
}

function buildTree(orgs: Organization[]): {
  byParent: Map<string | null, Organization[]>
  roots:    Organization[]
  companies: string[]
} {
  const byParent = new Map<string | null, Organization[]>()
  const companySet = new Set<string>()
  for (const org of orgs) {
    const key = org.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(org)
    if (org.companyId) companySet.add(org.companyId)
  }
  const roots = [...(byParent.get(null) ?? [])]
  return { byParent, roots, companies: [...companySet] }
}

export function OrgTreePanel({
  orgs, selectedId, onSelectOrg,
  renderOrgRow, placeholder = '🔍 組織名で検索', emptyMessage = '該当なし',
}: Props) {
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())
  const [companyEx, setCompanyEx] = useState<Set<string>>(new Set())

  const { byParent, companies } = useMemo(() => buildTree(orgs), [orgs])

  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs])

  const searchLower = search.toLowerCase()
  const searchResults = useMemo(() => {
    if (!searchLower) return null
    return orgs.filter(o => o.name.toLowerCase().includes(searchLower) ||
      (o.externalCode ?? '').toLowerCase().includes(searchLower))
  }, [orgs, searchLower])

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleCompany = (id: string) =>
    setCompanyEx(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // Expand all ancestors of an org so it's visible
  const revealOrg = (orgId: string) => {
    const toExpand: string[] = []
    let cur = orgById.get(orgId)
    while (cur?.parentId) {
      toExpand.push(cur.parentId)
      cur = orgById.get(cur.parentId)
    }
    setExpanded(prev => { const s = new Set(prev); toExpand.forEach(id => s.add(id)); return s })
    if (cur?.companyId) {
      setCompanyEx(prev => { const s = new Set(prev); s.add(cur!.companyId); return s })
    }
  }

  const handleSelect = (orgId: string) => {
    onSelectOrg(orgId)
    revealOrg(orgId)
    setSearch('')
  }

  function renderNode(org: Organization, depth: number): React.ReactNode {
    const children = byParent.get(org.id) ?? []
    const isExpanded = expanded.has(org.id)
    const isSelected = selectedId === org.id
    const hasChildren = children.length > 0

    return (
      <div key={org.id}>
        <div
          className={`flex items-center gap-1 px-1 py-1 rounded cursor-pointer transition-colors text-xs ${
            isSelected ? 'bg-blue-100 text-blue-800 font-semibold' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => onSelectOrg(org.id)}
        >
          {hasChildren ? (
            <button
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); toggle(org.id) }}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-300">—</span>
          )}
          <span className="flex-1 truncate">{org.name}</span>
          {org.externalCode && (
            <span className="flex-shrink-0 text-[10px] text-gray-400 mr-1">[{org.externalCode}]</span>
          )}
          {renderOrgRow?.(org)}
        </div>
        {isExpanded && children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  // Orgs that belong to each company and have no parent within current orgs set
  const orgIdSet = useMemo(() => new Set(orgs.map(o => o.id)), [orgs])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="flex-shrink-0 px-2 py-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-1">
        {/* Search mode */}
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">{emptyMessage}</div>
          ) : (
            searchResults.map(org => (
              <button
                key={org.id}
                onClick={() => handleSelect(org.id)}
                className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-blue-50 text-xs transition-colors"
              >
                <span className="text-gray-400">🏢</span>
                <span className="font-medium text-gray-700 truncate flex-1">{org.name}</span>
                {org.externalCode && <span className="text-gray-400 text-[10px]">[{org.externalCode}]</span>}
                {renderOrgRow?.(org)}
              </button>
            ))
          )
        ) : (
          /* Tree mode — grouped by company */
          companies.length > 0 ? (
            companies.map(companyId => {
              const companyRoots = orgs.filter(
                o => o.companyId === companyId && (!o.parentId || !orgIdSet.has(o.parentId))
              )
              if (companyRoots.length === 0) return null
              const isOpen = companyEx.has(companyId)
              return (
                <div key={companyId} className="mb-1 border border-gray-200 rounded">
                  <button
                    onClick={() => toggleCompany(companyId)}
                    className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded transition-colors"
                  >
                    <span className="truncate">{companyId}</span>
                    <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && (
                    <div className="py-0.5">
                      {companyRoots.map(org => renderNode(org, 0))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            orgs
              .filter(o => !o.parentId || !orgIdSet.has(o.parentId))
              .map(org => renderNode(org, 0))
          )
        )}
      </div>
    </div>
  )
}
