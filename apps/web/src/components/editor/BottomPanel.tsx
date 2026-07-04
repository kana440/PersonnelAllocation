import { useState, useMemo } from 'react'
import { useScopedStore } from '../../store/useScopedStore'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'
import { exportToXlsx } from '../../infrastructure/excel/engine'
import { useReviewData } from '../review/hooks/useReviewData'
import { ChangeDigest }        from '../review/components/ChangeDigest'
import { ValidationDashboard } from '../review/components/ValidationDashboard'
import { ExcelPreview }        from './ExcelPreview'
import { ExportOrgDialog }     from './ExportOrgDialog'
import { UnifiedReviewView }   from '../review/UnifiedReviewView'

type Tab = 'unified' | 'digest' | 'validation' | 'excel'

const TABS: { id: Tab; shortLabel: string; fullLabel: string }[] = [
  { id: 'unified',    shortLabel: '一覧',       fullLabel: '変更一覧（統合）' },
  { id: 'digest',     shortLabel: '集計',       fullLabel: '集計' },
  { id: 'validation', shortLabel: '問題',       fullLabel: '問題確認' },
  { id: 'excel',      shortLabel: 'Excel',      fullLabel: 'Excel形式' },
]

interface Props {
  isCollapsed:      boolean
  onToggleCollapse: () => void
}

export function BottomPanel({ isCollapsed, onToggleCollapse }: Props) {
  const data  = useReviewData()
  const store = useScopedStore()

  const [activeTab,        setActiveTab]        = useState<Tab>('unified')
  const [, setGridNav] = useState<{ filterKind?: string; changedOnly: boolean }>({ changedOnly: false })
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // エクスポート用に Excel 行を計算
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

  // ChangeDigest のカードクリック → タブ遷移
  const handleSelectTab = (tab: string, filterKind?: string) => {
    const found = TABS.find(t => t.id === tab)
    if (!found) return
    setActiveTab(found.id)
    if (found.id === 'unified' && filterKind) setGridNav({ filterKind, changedOnly: filterKind !== undefined })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ヘッダー（常時表示） ── */}
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
            onClick={onToggleCollapse}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
            title={isCollapsed ? 'レビューを展開' : 'レビューを折りたたむ'}
          >
            {isCollapsed ? '▲ 展開' : '▼ 折りたたむ'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── 左タブナビ ── */}
          <nav className="flex-shrink-0 w-12 flex flex-col border-r border-gray-200 bg-gray-50">
            {TABS.map(tab => {
              const isActive  = activeTab === tab.id
              const showBadge = tab.id === 'validation' && data.totalIssues > 0
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    if (tab.id === 'unified') setGridNav({ changedOnly: false })
                  }}
                  title={tab.fullLabel}
                  className={`flex-1 flex flex-col items-center justify-center border-b border-gray-200 transition-colors relative px-1 py-1 ${
                    isActive
                      ? 'bg-white border-l-2 border-l-blue-500 text-blue-700'
                      : 'text-gray-400 hover:bg-gray-100 border-l-2 border-l-transparent'
                  }`}
                >
                  <span className="text-[11px] font-medium leading-tight text-center whitespace-pre-line">{tab.shortLabel}</span>
                  {showBadge && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                </button>
              )
            })}
          </nav>

          {/* ── タブコンテンツ ── */}
          <div className="flex-1 overflow-hidden min-h-0">
            {activeTab === 'unified' && (
              <UnifiedReviewView />
            )}
            {activeTab === 'digest' && (
              <ChangeDigest data={data} onSelectTab={handleSelectTab} activeTab={activeTab} />
            )}
            {activeTab === 'validation' && (
              <ValidationDashboard rows={data.rows} onDrillDown={() => setActiveTab('unified')} />
            )}
            {activeTab === 'excel' && (
              <ExcelPreview showExport={false} />
            )}
          </div>
        </div>
      )}

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
