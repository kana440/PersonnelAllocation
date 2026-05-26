import { useMemo } from 'react'
import type { ReviewRow } from '../hooks/useReviewData'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  rows:        ReviewRow[]
  onDrillDown: (filterIssues: boolean) => void
}

interface IssueGroup {
  message:  string
  level:    ValidationIssue['level']
  field:    string
  count:    number
}

export function ValidationDashboard({ rows, onDrillDown }: Props) {
  const issueGroups = useMemo((): IssueGroup[] => {
    const map = new Map<string, IssueGroup>()
    for (const { issues } of rows) {
      for (const issue of issues) {
        const key = `${String(issue.field)}::${issue.message}`
        if (!map.has(key)) {
          map.set(key, { message: issue.message, level: issue.level, field: String(issue.field), count: 0 })
        }
        map.get(key)!.count++
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [rows])

  const totalIssues   = rows.reduce((acc, r) => acc + r.issues.length, 0)
  const rowsWithIssue = rows.filter(r => r.issues.length > 0).length
  const errorCount    = rows.reduce((acc, r) => acc + r.issues.filter(i => i.level === 'error').length, 0)
  const warningCount  = totalIssues - errorCount

  if (totalIssues === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <div className="text-4xl">✓</div>
        <div className="text-sm font-medium">問題なし</div>
        <div className="text-xs">全 {rows.length} レコードにワーニング・エラーはありません</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* サマリーバー（1行に収める） */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-red-50">
        <span className="text-xs font-semibold text-red-700">合計 {totalIssues} 件</span>
        {errorCount   > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-700">エラー {errorCount}</span>}
        {warningCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">警告 {warningCount}</span>}
        <span className="text-[10px] text-red-500">{rowsWithIssue} 名に問題あり</span>
        <button
          onClick={() => onDrillDown(true)}
          className="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          一覧で確認 →
        </button>
      </div>

      {/* issue グループ一覧 */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1">
        {issueGroups.map((g, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${
              g.level === 'error' ? 'border-red-200 bg-red-50' : 'border-orange-100 bg-orange-50'
            }`}
          >
            <span className={`flex-shrink-0 text-[10px] font-bold w-4 text-center ${
              g.level === 'error' ? 'text-red-600' : 'text-orange-500'
            }`}>
              {g.level === 'error' ? '✕' : '⚠'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-gray-700">{g.message}</span>
              <span className="text-[10px] text-gray-400 ml-2">{g.field}</span>
            </div>
            <span className={`flex-shrink-0 text-sm font-bold ${
              g.level === 'error' ? 'text-red-600' : 'text-orange-600'
            }`}>
              {g.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
