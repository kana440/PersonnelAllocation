import { useState, useMemo } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { IS_MOCK_MODE, DEFAULT_MODELS, createAgentRunner } from '../../infrastructure/ai/chatServiceFactory'
import { useChatHandlers } from './useChatHandlers'
import { AIMessageThread } from './AIMessageThread'

interface Props {
  onClose: () => void
}

export function AIChatDrawer({ onClose }: Props) {
  const { messages, selectedModel } = useChatStore()
  const [input, setInput] = useState('')

  // Use the model selected in AIView (persisted in store), fall back to first default
  const agentRunner = useMemo(() => {
    const model = selectedModel || DEFAULT_MODELS[0] || ''
    return model ? createAgentRunner(model) : null
  }, [selectedModel])

  const { widgetCallbacks, handleTextSubmit, isBusy, activeWidgetMsgId } =
    useChatHandlers({ agentRunner })

  const send = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    handleTextSubmit(text)
  }

  return (
    <div className="flex flex-col h-full bg-white">
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

      {/* Message thread — shared with AIView via useChatStore */}
      <div className="flex-1 overflow-hidden min-h-0">
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
      </div>

      {/* Text input */}
      <div className="flex-shrink-0 border-t border-gray-200 p-2 flex gap-2">
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
  )
}
