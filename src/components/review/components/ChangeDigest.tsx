import type { ReviewData } from '../hooks/useReviewData'
import type { ChangeKind } from '../../../domain/review/changeDetection'

interface Props {
  data:        ReviewData
  onSelectTab: (tab: string, filterKind?: string) => void
  activeTab:   string
}

interface Stat {
  label:       string
  value:       number
  color:       string
  bgColor:     string
  tab?:        string
  filterKind?: ChangeKind
}

export function ChangeDigest({ data, onSelectTab }: Props) {
  const { summary, totalIssues, rows } = data

  const changedRows   = rows.filter(r => r.changes.diffCount > 0).length
  const unchangedRows = rows.length - changedRows

  // 3グループに分けて区切り線で視覚的に整理
  const groups: { label: string; stats: Stat[] }[] = [
    {
      label: '概要',
      stats: [
        { label: '総レコード', value: rows.length,     color: 'text-gray-700',   bgColor: 'bg-gray-50' },
        { label: '変更あり',  value: changedRows,     color: 'text-blue-700',   bgColor: 'bg-blue-50',   tab: 'grid' },
        { label: '変更なし',  value: unchangedRows,   color: 'text-gray-400',   bgColor: 'bg-gray-50' },
      ],
    },
    {
      label: '変更種別',
      stats: [
        { label: '組織異動', value: summary.transfers,   color: 'text-blue-600',   bgColor: 'bg-blue-50',   tab: 'grid', filterKind: 'transfer' },
        { label: '昇級',    value: summary.promotions,  color: 'text-green-600',  bgColor: 'bg-green-50',  tab: 'grid', filterKind: 'promotion' },
        { label: '降級',    value: summary.demotions,   color: 'text-orange-600', bgColor: 'bg-orange-50', tab: 'grid', filterKind: 'demotion' },
        { label: '職位変更', value: summary.titleChanges,color: 'text-purple-600', bgColor: 'bg-purple-50', tab: 'grid', filterKind: 'titleChange' },
        { label: '新規採用', value: summary.newHires,    color: 'text-teal-600',   bgColor: 'bg-teal-50',   tab: 'grid', filterKind: 'newHire' },
        { label: '退職',    value: summary.terminations,color: 'text-red-600',    bgColor: 'bg-red-50',    tab: 'grid', filterKind: 'termination' },
      ],
    },
    {
      label: '問題',
      stats: [
        { label: 'バンド不整合', value: summary.bandMismatches, color: 'text-amber-600', bgColor: 'bg-amber-50', tab: 'validation' },
        { label: '問題あり',    value: summary.withIssues,     color: 'text-red-600',   bgColor: 'bg-red-50',   tab: 'validation' },
        { label: '総ワーニング', value: totalIssues,            color: 'text-red-500',   bgColor: 'bg-red-50',   tab: 'validation' },
      ],
    },
  ]

  return (
    <div className="h-full flex items-stretch gap-0 overflow-hidden">
      {groups.map((group, gi) => (
        <div key={group.label} className={`flex flex-col ${gi < groups.length - 1 ? 'border-r border-gray-200' : ''}`}>
          {/* グループラベル */}
          <div className="flex-shrink-0 px-2 pt-1.5 pb-0.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
            {group.label}
          </div>
          {/* カード群：横に並べる */}
          <div className="flex items-start gap-1.5 px-2 pb-2 flex-1">
            {group.stats.map(({ label, value, color, bgColor, tab, filterKind }) => (
              <button
                key={label}
                onClick={tab ? () => onSelectTab(tab, filterKind) : undefined}
                disabled={!tab}
                title={tab ? `${label}の詳細を表示` : undefined}
                className={`flex flex-col items-center text-center px-2.5 py-1.5 rounded-lg border transition-colors min-w-[60px] ${bgColor} ${
                  tab
                    ? 'hover:brightness-95 cursor-pointer border-transparent hover:border-gray-300 shadow-sm'
                    : 'cursor-default border-transparent'
                }`}
              >
                <span className={`text-xl font-bold leading-tight ${color}`}>{value.toLocaleString()}</span>
                <span className="text-[10px] text-gray-500 leading-tight mt-0.5 whitespace-nowrap">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
