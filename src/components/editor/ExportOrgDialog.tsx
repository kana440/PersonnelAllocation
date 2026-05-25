import { useState, useMemo } from 'react'
import type { Organization } from '../../domain/schemas'
import type { AllocationRow } from '../../infrastructure/allocationListMapper'
import { exportToXlsx } from '../../infrastructure/excel/engine'

interface Props {
  afterOrgs:     Organization[]    // scoped orgs to display
  rows:          AllocationRow[]   // scoped mapped rows (already filtered)
  effectiveDate: string
  scopeOrg:      Organization | null
  onClose:       () => void
}

function getDescendantIds(orgId: string, orgs: Organization[]): string[] {
  const result: string[] = []
  const queue = [orgId]
  while (queue.length > 0) {
    const id = queue.shift()!
    orgs.filter(o => o.parentId === id).forEach(c => { result.push(c.id); queue.push(c.id) })
  }
  return result
}

export function ExportOrgDialog({ afterOrgs, rows, effectiveDate, scopeOrg, onClose }: Props) {
  // All selectable org ids (in scope)
  const allOrgIds = useMemo(() => afterOrgs.map(o => o.id), [afterOrgs])
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(() => new Set(allOrgIds))

  // Expand/collapse state — effective roots start expanded, children collapsed
  const viewOrgIds = useMemo(() => new Set(afterOrgs.map(o => o.id)), [afterOrgs])
  const effectiveRoots = useMemo(
    () => afterOrgs.filter(o => !o.parentId || !viewOrgIds.has(o.parentId)),
    [afterOrgs, viewOrgIds]
  )
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set(afterOrgs.filter(o => !o.parentId || !viewOrgIds.has(o.parentId)).map(o => o.id))
  )
  const toggleExpand = (orgId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      return next
    })
  }

  // Map code → org for row filtering and count lookup
  const orgByCode = useMemo(() =>
    new Map(afterOrgs.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrgs]
  )

  // orgId → direct member count from rows
  const memberCountByOrgId = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (!row.departmentCode) continue
      const org = orgByCode.get(row.departmentCode)
      if (org) map.set(org.id, (map.get(org.id) ?? 0) + 1)
    }
    return map
  }, [rows, orgByCode])

  // orgId → direct child org IDs
  const childrenByParentId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const org of afterOrgs) {
      if (!org.parentId) continue
      const arr = map.get(org.parentId) ?? []
      arr.push(org.id)
      map.set(org.parentId, arr)
    }
    return map
  }, [afterOrgs])

  // Total count (direct + all descendants) per org ID
  const totalCountByOrgId = useMemo(() => {
    const cache = new Map<string, number>()
    const getTotal = (orgId: string): number => {
      if (cache.has(orgId)) return cache.get(orgId)!
      const direct = memberCountByOrgId.get(orgId) ?? 0
      const total = direct + (childrenByParentId.get(orgId) ?? []).reduce((acc, id) => acc + getTotal(id), 0)
      cache.set(orgId, total)
      return total
    }
    for (const org of afterOrgs) getTotal(org.id)
    return cache
  }, [afterOrgs, memberCountByOrgId, childrenByParentId])

  // Selected-only count (direct + descendants that are checked) per org ID
  const selectedCountByOrgId = useMemo(() => {
    const cache = new Map<string, number>()
    const getSelected = (orgId: string): number => {
      if (cache.has(orgId)) return cache.get(orgId)!
      const direct = selectedOrgIds.has(orgId) ? (memberCountByOrgId.get(orgId) ?? 0) : 0
      const total = direct + (childrenByParentId.get(orgId) ?? []).reduce((acc, id) => acc + getSelected(id), 0)
      cache.set(orgId, total)
      return total
    }
    for (const org of afterOrgs) getSelected(org.id)
    return cache
  }, [afterOrgs, memberCountByOrgId, childrenByParentId, selectedOrgIds])

  // Rows to actually export (filtered by selected orgs)
  const exportRows = useMemo(() => {
    return rows.filter(r => {
      if (!r.departmentCode) return false
      const org = orgByCode.get(r.departmentCode)
      return org ? selectedOrgIds.has(org.id) : false
    })
  }, [rows, orgByCode, selectedOrgIds])

  const toggleOrg = (orgId: string) => {
    setSelectedOrgIds(prev => {
      const next = new Set(prev)
      const descendants = getDescendantIds(orgId, afterOrgs)
      if (next.has(orgId)) {
        next.delete(orgId)
        descendants.forEach(d => next.delete(d))
      } else {
        next.add(orgId)
        descendants.forEach(d => next.add(d))
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelectedOrgIds(prev =>
      prev.size === allOrgIds.length ? new Set() : new Set(allOrgIds)
    )
  }

  const handleExport = () => {
    exportToXlsx(exportRows, effectiveDate, scopeOrg?.name)
    onClose()
  }

  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children    = afterOrgs.filter(c => c.parentId === org.id)
    const hasChildren = children.length > 0
    const isExpanded  = expandedNodes.has(org.id)
    const isSelected  = selectedOrgIds.has(org.id)

    // Three-state checkbox: fully checked / indeterminate / unchecked
    const descIds         = getDescendantIds(org.id, afterOrgs)
    const anyDescSel      = descIds.some(d => selectedOrgIds.has(d))
    const allDescSel      = descIds.length > 0 && descIds.every(d => selectedOrgIds.has(d))
    const isFullyChecked  = isSelected || allDescSel
    const isIndeterminate = !isFullyChecked && anyDescSel

    const totalCount  = totalCountByOrgId.get(org.id) ?? 0
    const directCount = memberCountByOrgId.get(org.id) ?? 0
    // Mixed selection → show selected-only count; otherwise → total
    const displayCount = isIndeterminate
      ? (selectedCountByOrgId.get(org.id) ?? 0)
      : totalCount
    const showDirect = hasChildren && directCount > 0 && directCount !== totalCount

    return (
      <div key={org.id}>
        <div
          className={`flex items-center gap-1 py-1 rounded hover:bg-gray-50 transition-colors ${isFullyChecked ? 'bg-blue-50/50' : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
        >
          {/* Expand/collapse toggle */}
          <button
            onClick={() => hasChildren && toggleExpand(org.id)}
            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 text-[10px] rounded transition-colors ${hasChildren ? 'hover:text-gray-600 hover:bg-gray-200 cursor-pointer' : 'cursor-default opacity-0'}`}
            tabIndex={-1}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <input
            type="checkbox"
            checked={isFullyChecked}
            ref={el => { if (el) el.indeterminate = isIndeterminate }}
            onChange={() => toggleOrg(org.id)}
            className="flex-shrink-0 w-3.5 h-3.5 accent-blue-600"
          />
          <span className={`text-xs flex-1 truncate ml-1 ${isFullyChecked ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
            {org.name}
          </span>
          {displayCount > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0 ml-1 tabular-nums">
              {displayCount}名
              {showDirect && (
                <span className="text-[10px] text-gray-300 ml-0.5">（直下{directCount}）</span>
              )}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && children.map(c => renderOrgNode(c, depth + 1))}
      </div>
    )
  }

  const allSelected = selectedOrgIds.size === allOrgIds.length
  const noneSelected = selectedOrgIds.size === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[500px] flex flex-col gap-0 overflow-hidden"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-800">エクスポート対象の選択</div>
          {scopeOrg && (
            <div className="text-xs text-gray-500 mt-0.5">スコープ: {scopeOrg.name}</div>
          )}
        </div>

        {/* Toggle all + expand all + count */}
        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
          <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
            {allSelected ? 'すべて解除' : 'すべて選択'}
          </button>
          <span className="text-gray-300 text-xs">|</span>
          <button
            onClick={() => setExpandedNodes(
              expandedNodes.size === allOrgIds.length ? new Set(effectiveRoots.map(o => o.id)) : new Set(allOrgIds)
            )}
            className="text-xs text-gray-500 hover:underline"
          >
            {expandedNodes.size === allOrgIds.length ? '折りたたむ' : 'すべて展開'}
          </button>
          <span className="text-gray-300 text-xs">|</span>
          <span className="text-xs text-gray-500">
            <span className="font-semibold text-gray-800">{exportRows.length}</span> 行が出力対象
            {noneSelected && <span className="text-amber-600 ml-1">（組織を選択してください）</span>}
          </span>
        </div>

        {/* Org tree */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1">
          {afterOrgs.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-6">対象組織がありません</div>
          ) : (
            effectiveRoots.map(org => renderOrgNode(org, 0))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
            キャンセル
          </button>
          <button
            onClick={handleExport}
            disabled={noneSelected || exportRows.length === 0}
            className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            📤 {exportRows.length}行をエクスポート
          </button>
        </div>
      </div>
    </div>
  )
}
