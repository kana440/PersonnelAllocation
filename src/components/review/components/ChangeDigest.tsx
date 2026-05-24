import type { ReviewData } from '../hooks/useReviewData'
import type { ChangeKind } from '../../../domain/review/changeDetection'

interface Props {
  data:        ReviewData
  onSelectTab: (tab: string, filterKind?: string) => void
  activeTab:   string
}

interface Stat {
  label:      string
  value:      number
  color:      string
  tab?:       string
  filterKind?: ChangeKind
}

export function ChangeDigest({ data, onSelectTab }: Props) {
  const { summary, totalIssues, rows } = data

  const changedRows   = rows.filter(r => r.changes.diffCount > 0).length
  const unchangedRows = rows.length - changedRows

  const stats: Stat[] = [
    { label: '総レコード数', value: rows.length,              color: 'text-gray-700' },
    { label: '変更あり',    value: changedRows,              color: 'text-blue-700',   tab: 'grid' },
    { label: '変更なし',    value: unchangedRows,            color: 'text-gray-400' },
    { label: '組織異動',    value: summary.transfers,        color: 'text-blue-600',   tab: 'grid',       filterKind: 'transfer' },
    { label: '昇格',       value: summary.promotions,       color: 'text-green-600',  tab: 'grid',       filterKind: 'promotion' },
    { label: '降格',       value: summary.demotions,        color: 'text-orange-600', tab: 'grid',       filterKind: 'demotion' },
    { label: '職位名変更',  value: summary.titleChanges,     color: 'text-purple-600', tab: 'grid',       filterKind: 'titleChange' },
    { label: '新規採用',    value: summary.newHires,         color: 'text-teal-600',   tab: 'grid',       filterKind: 'newHire' },
    { label: '退職',       value: summary.terminations,     color: 'text-red-600',    tab: 'grid',       filterKind: 'termination' },
    { label: 'バンド不整合', value: summary.bandMismatches,  color: 'text-amber-600',  tab: 'validation' },
    { label: '問題あり',   value: summary.withIssues,       color: 'text-red-600',    tab: 'validation' },
    { label: '総ワーニング', value: totalIssues,             color: 'text-red-500',    tab: 'validation' },
  ]

  return (
    <div className="p-4">
      <div className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">変更ダイジェスト</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {stats.map(({ label, value, color, tab, filterKind }) => (
          <button
            key={label}
            onClick={tab ? () => onSelectTab(tab, filterKind) : undefined}
            disabled={!tab}
            className={`text-left px-3 py-3 rounded-lg border bg-white shadow-sm transition-colors ${
              tab ? 'hover:bg-blue-50 cursor-pointer border-gray-200 hover:border-blue-300' : 'cursor-default border-gray-100'
            }`}
          >
            <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            {tab && <div className="text-[10px] text-blue-400 mt-1">→ 詳細</div>}
          </button>
        ))}
      </div>
    </div>
  )
}
