import { useStore } from '../../store/useStore'

interface HistoryPanelProps {
  onClose: () => void
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const {
    undoHistory,
    historyCurrentPosition,
    isHistoryPreviewMode,
    historyPreviewPosition,
    previewHistoryAt,
    cancelHistoryPreview,
    applyHistoryPreview,
  } = useStore()

  const markerAt = isHistoryPreviewMode && historyPreviewPosition !== null
    ? historyPreviewPosition
    : historyCurrentPosition

  // 古い順（index 昇順）— 時系列で上から下に積む
  const sorted = [...undoHistory].sort((a, b) => a.index - b.index)
  const totalItems = sorted.length + 1  // +1 for 初期状態

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-600">操作履歴</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs w-4 h-4 flex items-center justify-center"
        >◀</button>
      </div>

      {/* プレビュー中バナー */}
      {isHistoryPreviewMode && (
        <div className="flex-shrink-0 px-2 py-1.5 bg-amber-50 border-b border-amber-200 flex flex-col gap-1">
          <span className="text-[10px] text-amber-700 font-medium">プレビュー中（読み取り専用）</span>
          <div className="flex gap-1">
            <button
              onClick={applyHistoryPreview}
              className="flex-1 py-0.5 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors"
            >この状態に戻す</button>
            <button
              onClick={cancelHistoryPreview}
              className="flex-1 py-0.5 text-[10px] rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >閉じる</button>
          </div>
        </div>
      )}

      {/* 履歴タイムライン（古い順：上から下） */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-1 px-1">

          {/* 初期状態（最上段 = 最古） */}
          {(() => {
            const isMarked = markerAt === 0
            const isFirst  = true
            return (
              <TimelineEntry
                isFirst={isFirst}
                isLast={totalItems === 1}
                isMarked={isMarked}
                isApplied={true}
                onClick={() => previewHistoryAt(0)}
                label="初期状態"
                labelClass={isMarked ? 'font-semibold text-indigo-700' : 'text-gray-400'}
              />
            )
          })()}

          {/* 操作エントリ */}
          {sorted.map((entry, i) => {
            const isMarked  = entry.index === markerAt
            const isApplied = entry.index <= historyCurrentPosition
            const isLast    = i === sorted.length - 1

            return (
              <TimelineEntry
                key={entry.index}
                isFirst={false}
                isLast={isLast}
                isMarked={isMarked}
                isApplied={isApplied}
                onClick={() => previewHistoryAt(entry.index)}
                label={entry.label}
                labelClass={
                  isMarked  ? 'font-semibold text-indigo-700' :
                  isApplied ? 'text-gray-700' :
                              'text-gray-400'
                }
              />
            )
          })}

          {/* 時間方向インジケーター */}
          <div className="flex items-center gap-1 px-2 pt-1 pb-0.5">
            <div className="w-6 flex-shrink-0 flex justify-center">
              <span className="text-[9px] text-gray-300">↓</span>
            </div>
            <span className="text-[9px] text-gray-300">新しい操作</span>
          </div>

        </div>
      </div>
    </div>
  )
}

interface TimelineEntryProps {
  isFirst:    boolean
  isLast:     boolean
  isMarked:   boolean
  isApplied:  boolean
  onClick:    () => void
  label:      string
  labelClass: string
}

function TimelineEntry({ isFirst, isLast, isMarked, isApplied, onClick, label, labelClass }: TimelineEntryProps) {
  return (
    <div className="flex items-stretch">
      {/* タイムライン縦線 + ドット */}
      <div className="flex flex-col items-center w-6 flex-shrink-0">
        {/* 上の線（最初のエントリは非表示） */}
        <div className={`w-px flex-1 ${isFirst ? 'bg-transparent' : 'bg-gray-200'}`} style={{ minHeight: '8px' }} />
        {/* ドット */}
        <div className={`
          w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 transition-colors
          ${isMarked
            ? 'border-indigo-500 bg-indigo-500'
            : isApplied
            ? 'border-gray-400 bg-gray-400'
            : 'border-gray-200 bg-white'
          }
        `} />
        {/* 下の線（最後のエントリは非表示） */}
        <div className={`w-px flex-1 ${isLast ? 'bg-transparent' : 'bg-gray-200'}`} style={{ minHeight: '8px' }} />
      </div>

      {/* エントリ本体 */}
      <button
        onClick={onClick}
        className={`
          flex-1 text-left py-1.5 pr-2 flex items-center gap-1 transition-colors rounded
          ${isMarked ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50'}
        `}
      >
        <span className={`text-[10px] w-3 flex-shrink-0 text-center ${isMarked ? 'opacity-100' : 'opacity-0'}`}>
          🔸
        </span>
        <span className={`text-[11px] truncate ${labelClass}`}>{label}</span>
      </button>
    </div>
  )
}
