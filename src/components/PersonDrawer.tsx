import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { PersonDetailPanel } from './PersonDetailPanel'

// 選択中の人物情報をドロワーとして右端に表示する。
// - 未選択: 細いストリップ（w-8）で「個人情報」と表示
// - 選択中・折り畳み: 人物名を縦書きで表示（クリックで展開）
// - 展開: PersonDetailPanel（詳細 + 手順追加フォーム）をフル表示
export function PersonDrawer() {
  const { selectedPersonId, persons, clearPersonSelection } = useStore()
  const [expanded, setExpanded] = useState(false)

  const person = persons.find(p => p.id === selectedPersonId)

  // 人物が選択されたら自動展開
  useEffect(() => {
    if (selectedPersonId) setExpanded(true)
  }, [selectedPersonId])

  // 選択解除 → 折り畳み
  useEffect(() => {
    if (!selectedPersonId) setExpanded(false)
  }, [selectedPersonId])

  if (!selectedPersonId) {
    return (
      <div className="flex-shrink-0 w-8 border-l border-gray-200 bg-gray-50 flex flex-col items-center pt-3 gap-1">
        <span
          className="text-xs text-gray-300 select-none"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.06em' }}
        >
          個人情報
        </span>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        title={`${person?.name ?? ''} — クリックして展開`}
        className="flex-shrink-0 w-8 border-l border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 flex flex-col items-center pt-2 transition-colors"
      >
        <span className="text-blue-400 text-xs mb-1">◀</span>
        <span
          className="text-xs font-medium text-blue-600 select-none overflow-hidden"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            maxHeight: '120px',
            textOverflow: 'ellipsis',
            letterSpacing: '0.05em',
          }}
        >
          {person?.name ?? ''}
        </span>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-[580px] border-l border-gray-200 bg-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-700 truncate flex-1">
          {person?.name ?? '個人情報'}
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-xs px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
          title="折りたたむ"
        >
          ▶
        </button>
        <button
          onClick={() => { clearPersonSelection(); setExpanded(false) }}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 text-xs px-1 transition-colors"
          title="閉じる"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <PersonDetailPanel />
      </div>
    </div>
  )
}
