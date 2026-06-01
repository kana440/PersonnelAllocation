import { useState, useMemo } from 'react'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/types'

interface AssigneeGroup {
  name: string        // 担当者名
  orgCounts: Map<string, number>  // 組織名 → 行数
  totalCount: number
}

interface Props {
  result: ImportedWorkbookResult
  onSelect: (assigneeName: string) => void
  onBack?: () => void
  noHeader?: boolean
}

export function AssigneeSelectStep({ result, onSelect, onBack, noHeader }: Props) {
  const [search, setSearch] = useState('')
  const [orgSearch, setOrgSearch] = useState('')

  // 組織コード → 組織名のマップ（before + after両方）
  const orgNameByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const org of result.beforeOrganizations) {
      if (org.externalCode) map.set(org.externalCode, org.name)
    }
    for (const org of result.afterOrganizations) {
      if (org.externalCode) map.set(org.externalCode, org.name)
    }
    return map
  }, [result.beforeOrganizations, result.afterOrganizations])

  // 担当者ごとのグループを集計
  const assigneeGroups = useMemo((): AssigneeGroup[] => {
    const groupMap = new Map<string, Map<string, number>>()

    for (const row of result.allocationList) {
      const name = row.assignee?.trim() ?? ''
      if (!groupMap.has(name)) groupMap.set(name, new Map())
      const orgMap = groupMap.get(name)!

      // 組織コードを解決（after優先、なければprev）
      const orgCode = row.departmentCode ?? row.prevDepartmentCode ?? ''
      const orgName = orgNameByCode.get(orgCode) ?? orgCode ?? '（組織未設定）'
      orgMap.set(orgName, (orgMap.get(orgName) ?? 0) + 1)
    }

    const groups: AssigneeGroup[] = []
    for (const [name, orgCounts] of groupMap) {
      const totalCount = Array.from(orgCounts.values()).reduce((s, n) => s + n, 0)
      groups.push({ name, orgCounts, totalCount })
    }

    // 担当者名でソート（未割当は末尾）
    return groups.sort((a, b) => {
      if (a.name === '' && b.name !== '') return 1
      if (a.name !== '' && b.name === '') return -1
      return a.name.localeCompare(b.name, 'ja')
    })
  }, [result.allocationList, orgNameByCode])

  const unassignedGroup = useMemo(
    () => assigneeGroups.find(g => g.name === ''),
    [assigneeGroups]
  )
  const namedGroups = useMemo(
    () => assigneeGroups.filter(g => g.name !== ''),
    [assigneeGroups]
  )

  // 担当者名フィルタ
  const searchLower = search.toLowerCase().trim()
  // 組織名フィルタ
  const orgSearchLower = orgSearch.toLowerCase().trim()

  const filteredGroups = useMemo(() => {
    return namedGroups.filter(g => {
      const matchesAssignee = !searchLower || g.name.toLowerCase().includes(searchLower)
      const matchesOrg = !orgSearchLower ||
        Array.from(g.orgCounts.keys()).some(orgName => orgName.toLowerCase().includes(orgSearchLower))
      return matchesAssignee && matchesOrg
    })
  }, [namedGroups, searchLower, orgSearchLower])

  return (
    <div className="space-y-4">
      {!noHeader && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">担当者を選択</h2>
            <p className="mt-0.5 text-xs text-gray-500">担当する組織の担当者名を選んでください。</p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← 戻る
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="担当者名で絞り込み"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
        />
        <input
          type="text"
          value={orgSearch}
          onChange={e => setOrgSearch(e.target.value)}
          placeholder="🔍 組織名"
          className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '260px' }}>
        {filteredGroups.length === 0 && !unassignedGroup ? (
          <div className="text-xs text-gray-400 text-center py-6">該当なし</div>
        ) : (
          <div className="py-1">
            {filteredGroups.map(group => (
              <AssigneeGroupRow
                key={group.name}
                group={group}
                onSelect={() => onSelect(group.name)}
              />
            ))}
            {unassignedGroup && (!searchLower && !orgSearchLower) && (
              <div className="border-t border-gray-100 mt-1 pt-1">
                <div className="flex items-start rounded px-3 py-2 hover:bg-amber-50 group cursor-pointer"
                  onClick={() => onSelect('')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-amber-600">⚠ 未割当</span>
                      <span className="text-xs text-gray-400">（担当者未設定行）</span>
                    </div>
                    <OrgBreakdown orgCounts={unassignedGroup.orgCounts} />
                  </div>
                  <span className="ml-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                    計 {unassignedGroup.totalCount} 行
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {assigneeGroups.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          担当者情報（A列）がありません。このまま開くと全行が表示されます（管理者モード相当）。
        </p>
      )}
    </div>
  )
}

function AssigneeGroupRow({ group, onSelect }: { group: AssigneeGroup; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const orgEntries = Array.from(group.orgCounts.entries())
  const hasMultipleOrgs = orgEntries.length > 1

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-start rounded hover:bg-blue-50 group px-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-5 h-7 flex items-center justify-center text-gray-400 text-xs flex-shrink-0 mt-1"
        >
          {hasMultipleOrgs ? (expanded ? '▾' : '▸') : ''}
        </button>
        <div className="flex-1 min-w-0 py-1.5">
          <button
            onClick={onSelect}
            className="w-full text-left text-sm font-medium text-gray-700 group-hover:text-blue-700 truncate block"
          >
            {group.name}
          </button>
          {!expanded && orgEntries.length === 1 && (
            <span className="text-xs text-gray-400">{orgEntries[0][0]}</span>
          )}
          {!expanded && orgEntries.length > 1 && (
            <span className="text-xs text-gray-400">{orgEntries.length} 組織</span>
          )}
          {expanded && <OrgBreakdown orgCounts={group.orgCounts} />}
        </div>
        <button
          onClick={onSelect}
          className="ml-3 flex-shrink-0 text-xs text-gray-400 group-hover:text-blue-700 tabular-nums whitespace-nowrap py-1.5"
        >
          計 {group.totalCount} 行
        </button>
      </div>
    </div>
  )
}

function OrgBreakdown({ orgCounts }: { orgCounts: Map<string, number> }) {
  return (
    <div className="mt-0.5 space-y-0.5">
      {Array.from(orgCounts.entries()).map(([orgName, count]) => (
        <div key={orgName} className="flex items-center gap-2 text-xs text-gray-400">
          <span className="truncate">{orgName}</span>
          <span className="tabular-nums whitespace-nowrap">{count} 行</span>
        </div>
      ))}
    </div>
  )
}
