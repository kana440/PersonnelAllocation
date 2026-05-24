import { useState, useMemo } from 'react'
import type { Organization } from '../../domain/schemas'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/types'
import { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import { CODE_LIST_LABELS } from '../../infrastructure/codeLists/parser'

interface Props {
  result: ImportedWorkbookResult
  onSelectAll: () => void
  onSelectOrg: (id: string, name: string) => void
}

export function OrgSelectStep({ result, onSelectAll, onSelectOrg }: Props) {
  const [search, setSearch] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  const orgs = result.afterOrganizations
  const viewOrgs = useMemo(() => orgs.filter(o => !o.isAbandoned), [orgs])
  const viewOrgIds = useMemo(() => new Set(viewOrgs.map(o => o.id)), [viewOrgs])

  const rootOrgs = useMemo(
    () => viewOrgs.filter(o => !o.parentId || !viewOrgIds.has(o.parentId)),
    [viewOrgs, viewOrgIds]
  )

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const s = new Set<string>()
    rootOrgs.forEach(o => {
      s.add(o.id)
      viewOrgs.filter(c => c.parentId === o.id).forEach(c => s.add(c.id))
    })
    return s
  })

  // Row count per org (direct rows only)
  const rowCountByCode = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of result.allocationList) {
      if (row.departmentCode) {
        map.set(row.departmentCode, (map.get(row.departmentCode) ?? 0) + 1)
      }
    }
    return map
  }, [result.allocationList])

  const getCount = (org: Organization): number =>
    org.externalCode ? (rowCountByCode.get(org.externalCode) ?? 0) : 0

  const searchLower = search.toLowerCase().trim()
  const searchResults = useMemo(
    () => searchLower ? viewOrgs.filter(o => o.name.toLowerCase().includes(searchLower)) : [],
    [searchLower, viewOrgs]
  )

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const renderNode = (org: Organization, depth: number): React.ReactNode => {
    const children = viewOrgs.filter(o => o.parentId === org.id)
    const isExpanded = expandedIds.has(org.id)
    const count = getCount(org)

    return (
      <div key={org.id}>
        <div className="flex items-center rounded hover:bg-blue-50 group" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
          <button
            onClick={() => toggleExpand(org.id)}
            className="w-5 h-6 flex items-center justify-center text-gray-400 text-xs flex-shrink-0"
          >
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : ''}
          </button>
          <button
            onClick={() => onSelectOrg(org.id, org.name)}
            className="flex-1 text-left text-sm text-gray-700 group-hover:text-blue-700 truncate py-1"
          >
            {org.name}
          </button>
          {count > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0 pr-3 tabular-nums">{count}</span>
          )}
        </div>
        {isExpanded && children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  // Import result details for the collapsible section
  const codeListKeys = (Object.keys(CODE_LIST_LABELS) as (keyof typeof CODE_LIST_LABELS)[])
    .filter(k => k !== 'orgMasterEntries')
  const foundCodeListKeys = codeListKeys.filter(k => {
    const val = result.codeLists[k]
    return Array.isArray(val) && val.length > 0
  })
  const codeListFound = result.sheetsFound.includes(SHEET_CODE_LISTS)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-800">作業スコープを選択</h2>
        <p className="mt-0.5 text-xs text-gray-500">担当する組織を選んでください。全社担当の場合は「全組織から始める」を選択します。</p>
      </div>

      <button
        onClick={onSelectAll}
        className="w-full py-2.5 text-sm font-semibold border-2 border-blue-300 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors"
      >
        🏢 全組織から始める（スコープなし）
      </button>

      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <div className="flex-1 h-px bg-gray-200" />
          または組織を選択
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 組織名で検索"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:border-blue-400"
        />

        <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '220px' }}>
          {searchLower ? (
            searchResults.length === 0
              ? <div className="text-xs text-gray-400 text-center py-6">該当なし</div>
              : <div className="py-1">
                  {searchResults.map(org => {
                    const count = getCount(org)
                    return (
                      <button
                        key={org.id}
                        onClick={() => onSelectOrg(org.id, org.name)}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        <span className="flex-1 text-left truncate">{org.name}</span>
                        {count > 0 && <span className="text-xs text-gray-400 ml-2 tabular-nums">{count}</span>}
                      </button>
                    )
                  })}
                </div>
          ) : (
            <div className="py-1 px-1">
              {rootOrgs.length === 0
                ? <div className="text-xs text-gray-400 text-center py-6">組織データがありません</div>
                : rootOrgs.map(org => renderNode(org, 0))
              }
            </div>
          )}
        </div>
      </div>

      {/* Collapsible import details */}
      <div className="border-t border-gray-100 pt-3">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span>{showDetails ? '▾' : '▸'}</span>
          <span>読み込み結果の詳細を確認する</span>
        </button>
        {showDetails && (
          <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 space-y-2 text-xs">
            <DetailRow label={SHEET_ALLOCATION} found={result.sheetsFound.includes(SHEET_ALLOCATION)} detail={`${result.allocationRowCount} 行`} />
            <DetailRow label={SHEET_ORG_MASTER}  found={result.sheetsFound.includes(SHEET_ORG_MASTER)}  detail={`${result.orgEntries.length} 組織`} />
            <div className="flex items-start gap-1.5">
              <span className={`${codeListFound ? 'text-green-500' : 'text-gray-300'}`}>{codeListFound ? '✓' : '—'}</span>
              <span className={`font-mono ${codeListFound ? 'text-gray-700' : 'text-gray-400'}`}>{SHEET_CODE_LISTS}</span>
              {codeListFound && (
                <span className="text-gray-400">
                  {foundCodeListKeys.length}/{codeListKeys.length} 種 ({foundCodeListKeys.map(k => CODE_LIST_LABELS[k]).join('・')})
                </span>
              )}
              {!codeListFound && <span className="text-gray-400 italic">シートなし</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, found, detail }: { label: string; found: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`${found ? 'text-green-500' : 'text-gray-300'}`}>{found ? '✓' : '—'}</span>
      <span className={`font-mono ${found ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
      {found && detail && <span className="text-gray-400">{detail}</span>}
      {!found && <span className="text-gray-400 italic">シートなし</span>}
    </div>
  )
}
