import { useState } from 'react'
import { useCanvasDisplayStore, CANVAS_DISPLAYABLE_FIELDS } from '../../store/canvasDisplayStore'

interface Props {
  onClose: () => void
}

export function CanvasFieldPicker({ onClose }: Props) {
  const { displayFields, setDisplayFields } = useCanvasDisplayStore()
  const [selected, setSelected] = useState<string[]>(displayFields)
  const [activeRight, setActiveRight] = useState<string | null>(null)

  const available = CANVAS_DISPLAYABLE_FIELDS.filter(f => !selected.includes(f.key))
  const selectedDefs = selected
    .map(key => CANVAS_DISPLAYABLE_FIELDS.find(f => f.key === key))
    .filter((f): f is typeof CANVAS_DISPLAYABLE_FIELDS[number] => f !== undefined)

  const addField = (key: string) => {
    setSelected(prev => [...prev, key])
    setActiveRight(key)
  }

  const removeField = (key: string) => {
    setSelected(prev => prev.filter(k => k !== key))
    setActiveRight(null)
  }

  const moveUp = (key: string) => {
    setSelected(prev => {
      const idx = prev.indexOf(key)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  const moveDown = (key: string) => {
    setSelected(prev => {
      const idx = prev.indexOf(key)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  const handleSave = () => {
    setDisplayFields(selected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 640, maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">キャンバス表示フィールド</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              固定表示: ポジション名・ポジションコード / 姓名・グループ・ユーザーID
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body: two-column picker */}
        <div className="flex flex-1 overflow-hidden min-h-0 gap-0">

          {/* Left: available fields */}
          <div className="flex flex-col w-64 border-r border-gray-200 flex-shrink-0">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500">選択可能な項目</span>
              <span className="text-xs text-gray-400 ml-2">（クリックで追加）</span>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {available.length === 0 ? (
                <div className="text-xs text-gray-300 text-center py-6">すべて選択済み</div>
              ) : (
                available.map(field => (
                  <button
                    key={field.key}
                    onClick={() => addField(field.key)}
                    className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {field.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Center: arrow hints */}
          <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 gap-3 text-gray-300">
            <span className="text-sm">→</span>
            <span className="text-sm">←</span>
          </div>

          {/* Right: selected fields with reorder */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500">表示する項目</span>
              <span className="text-xs text-gray-400 ml-2">（クリックで選択→↑↓で並べ替え）</span>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {selectedDefs.length === 0 ? (
                <div className="text-xs text-gray-300 text-center py-6">左から追加してください</div>
              ) : (
                selectedDefs.map((field, idx) => {
                  const isActive = activeRight === field.key
                  return (
                    <div
                      key={field.key}
                      onClick={() => setActiveRight(isActive ? null : field.key)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex-1 font-medium">{field.label}</span>
                      <button
                        onClick={e => { e.stopPropagation(); moveUp(field.key) }}
                        disabled={idx === 0}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-[10px]"
                        title="上へ"
                      >↑</button>
                      <button
                        onClick={e => { e.stopPropagation(); moveDown(field.key) }}
                        disabled={idx === selectedDefs.length - 1}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-[10px]"
                        title="下へ"
                      >↓</button>
                      <button
                        onClick={e => { e.stopPropagation(); removeField(field.key) }}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-[10px]"
                        title="削除"
                      >✕</button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={() => { setSelected([]); setActiveRight(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            すべてクリア
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-1.5 transition-colors">
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              適用
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
