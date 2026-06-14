import { useState } from 'react'
import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'
import type { ClassificationWidgetData } from '../../../application/aiTypes'
import { ClassificationResultWidget } from '../widgets/ClassificationResultWidget'

type Filter = 'pending' | 'applied' | 'rejected' | 'all'

const FILTER_LABELS: Record<Filter, string> = {
  pending:  '承認待ち',
  applied:  '適用済み',
  rejected: '却下済み',
  all:      '全て',
}

const KIND_LABELS: Record<string, string> = {
  tool_description_issue: 'ツール説明',
  business_rule_gap:      '業務ルール',
  workflow_pattern:       'スキル',
  tool_logic_bug:         'Code Fix',
  missing_tool:           '新規ツール',
}

const STATUS_COLORS: Record<Filter, string> = {
  pending:  'bg-amber-100 text-amber-700',
  applied:  'bg-green-100 text-green-700',
  rejected: 'bg-gray-100 text-gray-500',
  all:      'bg-gray-100 text-gray-500',
}

interface Props {
  refresh:    number
  onRefresh:  () => void
  onApply:    (classified: ClassificationWidgetData) => void
  onReject:   (classifiedId: string) => void
}

export function PendingView({ refresh: _, onRefresh, onApply, onReject }: Props) {
  const [filter, setFilter] = useState<Filter>('pending')

  const captures    = feedbackStore.getCaptures()
  const captureMap  = new Map(captures.map(c => [c.id, c]))
  const allItems    = feedbackStore.getClassified().slice().reverse()
  const items       = filter === 'all' ? allItems : allItems.filter(c => c.status === filter)
  const pendingCount = allItems.filter(c => c.status === 'pending').length

  const handleApply = (classified: ClassificationWidgetData) => {
    onApply(classified)
    onRefresh()
  }

  const handleReject = (id: string) => {
    onReject(id)
    onRefresh()
  }

  const filterButtons: Filter[] = ['pending', 'applied', 'rejected', 'all']

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
        <p className="text-2xl">✅</p>
        <p className="text-sm font-medium text-gray-600">訂正履歴はありません</p>
        <p className="text-xs text-gray-400">
          チャット内の「AIに教える」ボタンで訂正すると<br />ここに表示されます
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* フィルタバー */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        {filterButtons.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
              filter === f
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {FILTER_LABELS[f]}
            {f === 'pending' && pendingCount > 0 && (
              <span className={`text-[10px] px-1 rounded-full font-medium ${
                filter === f ? 'bg-blue-400 text-white' : 'bg-amber-500 text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* リスト */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">
            {FILTER_LABELS[filter]}の訂正はありません
          </p>
        ) : (
          items.map(c => {
            const capture = captureMap.get(c.captureId)
            return (
              <div key={c.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                {/* ヘッダー */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      STATUS_COLORS[c.status as Filter] ?? 'bg-gray-100 text-gray-500'
                    }`}>
                      {FILTER_LABELS[c.status as Filter] ?? c.status}
                    </span>
                    <span className="text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">
                      {KIND_LABELS[c.kind] ?? c.kind}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(c.createdAt).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="px-3 py-2 space-y-2">
                  {/* 元の訂正テキスト */}
                  {capture?.userCorrection && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                      <p className="text-[10px] text-amber-600 font-medium mb-0.5">訂正内容</p>
                      <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {capture.userCorrection}
                      </p>
                    </div>
                  )}

                  {/* 分類結果ウィジェット（pending のみ操作可） */}
                  {c.status === 'pending' ? (
                    <ClassificationResultWidget
                      classified={c as unknown as ClassificationWidgetData}
                      onApply={handleApply}
                      onReject={handleReject}
                    />
                  ) : (
                    /* 適用済み・却下済み：reasoning のみ表示 */
                    <p className="text-xs text-gray-400 italic leading-relaxed">
                      {c.reasoning}
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
