import { useState, useMemo, useCallback, useEffect } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { useStore } from '../../store/useStore'
import { useSkillStore } from '../../store/skillStore'
import { IS_MOCK_MODE, DEFAULT_MODELS, createAgentRunner } from '../../infrastructure/ai/chatServiceFactory'
import { InMemoryTraceObserver } from '../../infrastructure/ai/aiTrace'
import { useChatHandlers } from './useChatHandlers'
import { useChatDrop } from './useChatDrop'
import { AIMessageThread } from './AIMessageThread'
import { AITracePanel }    from './AITracePanel'
import { AIContextSuggestions } from './AIContextSuggestions'
import { SkillsPanel } from './SkillsPanel'
import type { Skill } from '../../infrastructure/skills/types'

const MOCK_MODEL = '__mock__'

interface Props {
  onClose: () => void
}

export function AIChatDrawer({ onClose }: Props) {
  const { messages, selectedModel, setSelectedModel, chatContextRowIds, removeFromChatContext, clearMessages } = useChatStore()
  const allocationList = useStore(s => s.allocationList)
  const { load: loadSkills } = useSkillStore()
  const [input, setInput] = useState('')

  // ── スキルパネル表示状態 ────────────────────────────────────────────────────
  const [showSkills,   setShowSkills]   = useState(false)
  const [skillView,    setSkillView]    = useState<'list' | 'editor'>('list')
  const [editorSkill,  setEditorSkill]  = useState<Skill | null>(null)

  const handleSetSkillView = (v: 'list' | 'editor', skill?: Skill | null) => {
    setSkillView(v)
    if (v === 'editor') setEditorSkill(skill ?? null)
  }

  // ── Model selection ─────────────────────────────────────────────────────────
  const [models,   setModels]   = useState<string[]>(DEFAULT_MODELS)
  const [newModel, setNewModel] = useState('')
  const [model, setModelLocal] = useState<string>(
    () => selectedModel || (DEFAULT_MODELS[0] ?? MOCK_MODEL)
  )
  const setModel = (m: string) => { setModelLocal(m); setSelectedModel(m) }

  // 初回マウント時にスキルを読み込む
  useEffect(() => { void loadSkills() }, [loadSkills])

  const traceObserver = useMemo(() => new InMemoryTraceObserver(), [])
  const [logCopied, setLogCopied] = useState(false)

  const agentRunner = useMemo(() => {
    if (model === MOCK_MODEL) return null
    return createAgentRunner(model, traceObserver)
  }, [model, traceObserver])

  const handleCopyLog = useCallback(async () => {
    if (!agentRunner) return
    await navigator.clipboard.writeText(agentRunner.getSessionLog())
    setLogCopied(true)
    setTimeout(() => setLogCopied(false), 2000)
  }, [agentRunner])

  const handleClear = useCallback(() => {
    clearMessages()
    agentRunner?.clearSessionLog()
  }, [clearMessages, agentRunner])

  const { widgetCallbacks, handleTextSubmit, isBusy, activeWidgetMsgId } =
    useChatHandlers({ agentRunner, traceObserver })

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useChatDrop()

  const send = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    handleTextSubmit(text)
  }

  const handleSuggest = useCallback((prompt: string) => {
    if (isBusy) return
    handleTextSubmit(prompt)
  }, [isBusy, handleTextSubmit])

  const badgeItems = chatContextRowIds.map(rowId => {
    const row  = allocationList.find(r => r.rowId === rowId)
    const name = row
      ? ([row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`)
      : `行 ${rowId}`
    return { rowId, name }
  })

  // スキルパネルが開いているときはチャット UI を非表示にする
  if (showSkills) {
    return (
      <div className="flex flex-col h-full bg-white">
        <SkillsPanel
          onBack={() => { setShowSkills(false); setSkillView('list') }}
          view={skillView}
          editorSkill={editorSkill}
          onSetView={handleSetSkillView}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {/* 1行目: タイトル + ボタン群 */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <span className="text-sm font-semibold text-gray-700">AI アシスタント</span>
            {IS_MOCK_MODE && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-tight">モック</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowSkills(true); setSkillView('list') }}
              className="text-gray-400 hover:text-gray-600 text-base leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
              title="スキル設定"
            >
              ⚙
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                disabled={isBusy}
                className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
                title="会話履歴をクリア"
              >
                ↺
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        {/* 2行目: モデル選択（モックモード以外） */}
        {!IS_MOCK_MODE && (
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={isBusy}
              className="flex-1 min-w-0 text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50 truncate"
            >
              <option value={MOCK_MODEL}>Mock</option>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <form
              onSubmit={e => {
                e.preventDefault()
                const m = newModel.trim()
                if (m && !models.includes(m)) {
                  setModels(prev => [...prev, m])
                  setModel(m)
                }
                setNewModel('')
              }}
              className="flex items-center gap-0.5 flex-shrink-0"
            >
              <input
                type="text"
                value={newModel}
                onChange={e => setNewModel(e.target.value)}
                placeholder="モデルを追加…"
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              {newModel.trim() && (
                <button type="submit" className="text-xs text-blue-500 hover:text-blue-700">＋</button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {messages.length === 0 ? (
          <EmptyState />
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

      {/* Trace panel */}
      {agentRunner && (
        <AITracePanel
          traceObserver={traceObserver}
          onCopyLog={handleCopyLog}
          logCopied={logCopied}
        />
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200">
        {messages.length > 0 && !isBusy && (
          <AIContextSuggestions onSuggest={handleSuggest} compact />
        )}
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3">
      <div className="text-3xl">💬</div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">AI アシスタント</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          自然言語で操作の指示・照会ができます。<br />
          人物をドラッグしてコンテキストに追加すると<br />
          その人向けの操作候補が表示されます。
        </p>
      </div>
    </div>
  )
}
