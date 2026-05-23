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

  // org externalCode (or id) → member count from rows
  const memberCountByCode = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.departmentCode) map.set(row.departmentCode, (map.get(row.departmentCode) ?? 0) + 1)
    }
    return map
  }, [rows])

  // Map code → org for row filtering
  const orgByCode = useMemo(() =>
    new Map(afterOrgs.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrgs]
  )

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

  // Find effective roots (orgs whose parent is not in scope)
  const viewOrgIds = useMemo(() => new Set(afterOrgs.map(o => o.id)), [afterOrgs])
  const effectiveRoots = useMemo(
    () => afterOrgs.filter(o => !o.parentId || !viewOrgIds.has(o.parentId)),
    [afterOrgs, viewOrgIds]
  )

  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children    = afterOrgs.filter(c => c.parentId === org.id)
    const isSelected  = selectedOrgIds.has(org.id)
    const directCount = memberCountByCode.get(org.externalCode ?? org.id) ?? 0

    // Indeterminate: some but not all descendants selected
    const descIds  = getDescendantIds(org.id, afterOrgs)
    const anyDescSelected  = descIds.some(d => selectedOrgIds.has(d))
    const allDescSelected  = descIds.every(d => selectedOrgIds.has(d))
    const isIndeterminate  = !isSelected && anyDescSelected

    return (
      <div key={org.id}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <input
            type="checkbox"
            checked={isSelected || (isIndeterminate && allDescSelected)}
            ref={el => { if (el) el.indeterminate = isIndeterminate }}
            onChange={() => toggleOrg(org.id)}
            className="flex-shrink-0 w-3.5 h-3.5 accent-blue-600"
          />
          <span className={`text-xs flex-1 truncate ${isSelected ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
            {org.name}
          </span>
          {directCount > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0">{directCount}名</span>
          )}
        </div>
        {children.map(c => renderOrgNode(c, depth + 1))}
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

        {/* Toggle all + count */}
        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 hover:underline"
          >
            {allSelected ? 'すべて解除' : 'すべて選択'}
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
