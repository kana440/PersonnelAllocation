import { useState } from 'react'
import type { ConversationItem } from '../../../application/aiTypes'

interface Props {
  conversationWindow: ConversationItem[]
  onSubmit: (correction: string, window: ConversationItem[]) => void
  onCancel: () => void
}

export function TeachAIInputWidget({ conversationWindow, onSubmit, onCancel }: Props) {
  const [correction, setCorrection] = useState('')

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
      <p className="text-xs font-medium text-amber-800 mb-2">
        AIへの訂正・業務ルールの追加
      </p>
      <p className="text-xs text-amber-700 mb-2">
        どのように修正すべきかを説明してください:
      </p>
      <textarea
        className="w-full text-sm border border-amber-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        rows={3}
        autoFocus
        placeholder="例: 出向中の従業員のbandは変更してはいけません。この場合は変更をブロックすべきです。"
        value={correction}
        onChange={e => setCorrection(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && correction.trim()) {
            onSubmit(correction.trim(), conversationWindow)
          }
        }}
      />
      <div className="flex gap-2 mt-2">
        <button
          className="flex-1 text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!correction.trim()}
          onClick={() => onSubmit(correction.trim(), conversationWindow)}
        >
          AIに教える
        </button>
        <button
          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
