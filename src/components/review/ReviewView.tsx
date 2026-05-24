import { useState } from 'react'
import { useReviewData } from './hooks/useReviewData'
import { ChangeDigest }        from './components/ChangeDigest'
import { AttributeGrid }       from './components/AttributeGrid'
import { ValidationDashboard } from './components/ValidationDashboard'
import { OrgComparison }       from './components/org-comparison'

type Tab = 'digest' | 'grid' | 'validation' | 'comparison'

const TABS: { id: Tab; label: string }[] = [
  { id: 'digest',     label: 'A. ダイジェスト' },
  { id: 'grid',       label: 'B. 属性グリッド' },
  { id: 'validation', label: 'D. バリデーション' },
  { id: 'comparison', label: 'C. 組織比較' },
]

interface GridNavState {
  filterKind?:    string
  changedOnly:    boolean
}

interface Props {
  onClose: () => void
}

export function ReviewView({ onClose }: Props) {
  const data = useReviewData()
  const [activeTab,  setActiveTab]  = useState<Tab>('digest')
  const [gridNav,    setGridNav]    = useState<GridNavState>({ changedOnly: false })

  // Called from ChangeDigest cards — always implies changedOnly
  const handleSelectTab = (tab: string, filterKind?: string) => {
    if (!TABS.some(t => t.id === tab)) return
    setActiveTab(tab as Tab)
    if (tab === 'grid') {
      setGridNav({ filterKind, changedOnly: true })
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-800 text-white">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors font-medium"
        >
          ← 編集に戻る
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-semibold">レビュー</span>
        {data.totalIssues > 0 && (
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
            {data.totalIssues} 件の問題
          </span>
        )}
        <div className="ml-auto text-[10px] text-gray-400">全{data.rows.length}レコード</div>
      </div>

      {/* タブバー */}
      <div className="flex-shrink-0 flex border-b border-gray-200 bg-gray-50">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              // タブ直接クリック時はフィルタをリセット
              if (tab.id === 'grid') setGridNav({ changedOnly: false })
            }}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'digest' && (
          <div className="h-full overflow-y-auto">
            <ChangeDigest data={data} onSelectTab={handleSelectTab} activeTab={activeTab} />
          </div>
        )}
        {activeTab === 'grid' && (
          <AttributeGrid
            rows={data.rows}
            filterKind={gridNav.filterKind}
            defaultChangedOnly={gridNav.changedOnly}
          />
        )}
        {activeTab === 'validation' && (
          <ValidationDashboard rows={data.rows} onDrillDown={() => setActiveTab('grid')} />
        )}
        {activeTab === 'comparison' && (
          <OrgComparison orgMatches={data.orgMatches} />
        )}
      </div>
    </div>
  )
}
