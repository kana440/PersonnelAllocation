import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { AbsenceCategory } from './helpers'

interface Props {
  personName: string
  onConfirm:  (category: AbsenceCategory, memo: string) => void
  onCancel:   () => void
}

export function AbsenceDropDialog({ personName, onConfirm, onCancel }: Props) {
  const [memo, setMemo] = useState('')

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/30 flex items-center justify-center"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 w-72"
        onMouseDown={e => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-gray-800 mb-0.5 text-center truncate">{personName}</p>
        <p className="text-[11px] text-gray-400 mb-4 text-center">4/1 不在として登録</p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => onConfirm('退職', memo)}
            className="py-2.5 text-xs font-semibold rounded-lg bg-red-50 border-2 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors"
          >
            退職
          </button>
          <button
            onClick={() => onConfirm('移籍', memo)}
            className="py-2.5 text-xs font-semibold rounded-lg bg-orange-50 border-2 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-400 transition-colors"
          >
            移籍
          </button>
        </div>

        <input
          type="text"
          placeholder="メモ（任意）"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 mb-3"
          autoFocus
        />

        <button
          onClick={onCancel}
          className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>,
    document.body,
  )
}
