import { useState, useMemo } from 'react'
import { useScopedStore } from '../../store/useScopedStore'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'
import { exportToXlsx } from '../../infrastructure/excel/engine'
import { useReviewData } from '../review/hooks/useReviewData'
import { ExportOrgDialog }   from './ExportOrgDialog'
import { UnifiedReviewView } from '../review/UnifiedReviewView'

interface Props {
  /** Canvas に戻るボタン押下時のコールバック */
  onBackToCanvas: () => void
}

export function ReviewPane({ onBackToCanvas }: Props) {
  const data  = useReviewData()
  const store = useScopedStore()

  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const allOrgs = useMemo(() => {
    const beforeIds = new Set(store.organizations.map(o => o.id))
    return [
      ...store.organizations,
      ...store.afterOrganizations.filter(o => !beforeIds.has(o.id)),
    ]
  }, [store.organizations, store.afterOrganizations])

  const excelRows = useMemo(
    () => toAllocationRows(store.allocationList, allOrgs),
    [store.allocationList, allOrgs]
  )

  const scopeOrg = store.scopeOrgId
    ? store.afterOrganizations.find(o => o.id === store.scopeOrgId) ?? null
    : null

  const handleExport = () => {
    if (scopeOrg) {
      setExportDialogOpen(true)
    } else {
      exportToXlsx(excelRows, store.effectiveDate)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-700">レビュー</span>
        {data.totalIssues > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
            {data.totalIssues} 件の問題
          </span>
        )}
        <span className="text-xs text-gray-400">{excelRows.length.toLocaleString()} 件</span>

        <div className="ml-auto flex items-center gap-2">
          {scopeOrg && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              スコープ: {scopeOrg.name}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={excelRows.length === 0}
            className="flex items-center gap-1 px-2.5 py-0.5 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
          <button
            onClick={onBackToCanvas}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
            title="Canvas に戻る"
          >
            ← Canvas
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <UnifiedReviewView />
      </div>

      {exportDialogOpen && (
        <ExportOrgDialog
          afterOrgs={store.afterOrganizations}
          rows={excelRows}
          effectiveDate={store.effectiveDate}
          scopeOrg={scopeOrg}
          onClose={() => setExportDialogOpen(false)}
        />
      )}
    </div>
  )
}
