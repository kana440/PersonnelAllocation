import { useState, useMemo } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { useStore } from '../../store/useStore'
import { IS_MOCK_MODE, DEFAULT_MODELS, createAgentRunner } from '../../infrastructure/ai/chatServiceFactory'
import { useChatHandlers } from './useChatHandlers'
import { useChatDrop } from './useChatDrop'
import { AIMessageThread } from './AIMessageThread'

interface Props {
  onClose: () => void
}

export function AIChatDrawer({ onClose }: Props) {
  const { messages, selectedModel, chatContextRowIds, removeFromChatContext } = useChatStore()
  const allocationList = useStore(s => s.allocationList)
  const [input, setInput] = useState('')

  const agentRunner = useMemo(() => {
    const model = selectedModel || DEFAULT_MODELS[0] || ''
    return model ? createAgentRunner(model) : null
  }, [selectedModel])

  const { widgetCallbacks, handleTextSubmit, isBusy, activeWidgetMsgId } =
    useChatHandlers({ agentRunner })

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useChatDrop()

  const send = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    handleTextSubmit(text)
  }

  const badgeItems = chatContextRowIds.map(rowId => {
    const row  = allocationList.find(r => r.rowId === rowId)
    const name = row
      ? ([row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`)
      : `行 ${rowId}`
    return { rowId, name }
  })

  return (
    <div
      className="flex flex-col h-full bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-sm font-semibold text-gray-700">AI アシスタント</span>
          {IS_MOCK_MODE && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-tight">モック</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Message thread — ドラッグ中はオーバーレイで示す（コンテンツは差し替えない） */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            AI アシスタント画面で会話を始めてください
          </div>
        ) : (
          <AIMessageThread
            messages={messages}
            activeWidgetMsgId={activeWidgetMsgId}
            callbacks={widgetCallbacks}
          />
        )}
        {isDragOver && (
          <div className="absolute inset-0 bg-blue-50/90 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-blue-600 font-medium border border-blue-300 rounded-lg px-3 py-2 bg-white shadow-sm">
              ここにドロップしてコンテキストに追加
            </span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200">
        {badgeItems.length > 0 && (
          <div className="px-2 pt-1.5 flex flex-wrap gap-1">
            {badgeItems.map(({ rowId, name }) => (
              <div
                key={rowId}
                className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-xs text-blue-700 max-w-full overflow-hidden"
              >
                <span className="truncate font-medium">📌 {name}</span>
                <button
                  onClick={() => removeFromChatContext(rowId)}
                  className="flex-shrink-0 text-blue-400 hover:text-blue-600 leading-none"
                  title="コンテキストから削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="p-2 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="メッセージを入力… (Enter で送信)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400"
            disabled={isBusy}
          />
          <button
            onClick={send}
            disabled={isBusy || !input.trim()}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs rounded-lg transition-colors flex-shrink-0"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  )
}
