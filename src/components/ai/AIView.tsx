import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { IS_MOCK_MODE, DEFAULT_MODELS, createAgentRunner } from '../../infrastructure/ai/chatServiceFactory'
import { useChatHandlers } from './useChatHandlers'
import { AIWelcomeScreen }  from './AIWelcomeScreen'
import { AIMessageThread }  from './AIMessageThread'
import { AIInput }          from './AIInput'

const MOCK_MODEL = '__mock__'

interface Props {
  onOpenEditor: () => void
  onDataLoaded?: () => void
}

export function AIView({ onOpenEditor, onDataLoaded }: Props) {
  const { allocationList } = useStore()
  const { messages, phase, clearMessages, selectedModel, setSelectedModel } = useChatStore()

  // ── Model selection ───────────────────────────────────────────────────────────
  const [models,   setModels]   = useState<string[]>(DEFAULT_MODELS)
  const [newModel, setNewModel] = useState('')

  // Initialise from persisted store value (survives AI↔editor mode switches)
  const [model, setModelLocal] = useState<string>(
    () => selectedModel || (DEFAULT_MODELS[0] ?? MOCK_MODEL)
  )
  const setModel = (m: string) => { setModelLocal(m); setSelectedModel(m) }

  // Keep store in sync on first mount if nothing stored yet
  useEffect(() => {
    if (!selectedModel) setSelectedModel(model)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const agentRunner = useMemo(
    () => model === MOCK_MODEL ? null : createAgentRunner(model),
    [model],
  )

  const { widgetCallbacks, handlePromptClick, handleTextSubmit, isBusy, activeWidgetMsgId } =
    useChatHandlers({ agentRunner, onDataLoaded })

  const isDataLoaded = allocationList.length > 0

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">人事 AI アシスタント</h1>
            {IS_MOCK_MODE ? (
              <p className="text-xs text-amber-600">モックモード</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  disabled={isBusy}
                  className="text-xs text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50"
                >
                  <option value={MOCK_MODEL}>Mock（モック）</option>
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
                  className="flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newModel}
                    onChange={e => setNewModel(e.target.value)}
                    placeholder="モデルを追加…"
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                  {newModel.trim() && (
                    <button type="submit" className="text-xs text-blue-500 hover:text-blue-700">＋</button>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isBusy}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              title="会話履歴をクリア"
            >
              ↺ クリア
            </button>
          )}
          <button
            onClick={onOpenEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            エディターを開く →
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {messages.length === 0 ? (
          <AIWelcomeScreen
            isDataLoaded={isDataLoaded}
            onPromptClick={handlePromptClick}
          />
        ) : (
          <AIMessageThread
            messages={messages}
            activeWidgetMsgId={activeWidgetMsgId}
            callbacks={widgetCallbacks}
          />
        )}
      </div>

      {/* Suggested prompt chips */}
      {messages.length > 0 && isDataLoaded && phase === 'idle' && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-2 pb-0">
          <div className="max-w-2xl mx-auto flex flex-wrap gap-2">
            {[
              { id: 'check-dept',   label: '🏢 担当部門を確認する' },
              { id: 'report-line',  label: '📋 レポートラインを確認する' },
              { id: 'promote',      label: '⬆️ 昇進する人を選択' },
              { id: 'check-impact', label: '🔍 担当外への影響をチェック' },
              { id: 'export-excel', label: '📤 Excelをエクスポート' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handlePromptClick(p.id)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Text input */}
      {messages.length > 0 && (
        <div className="flex-shrink-0">
          <AIInput onSubmit={handleTextSubmit} disabled={isBusy || phase !== 'idle'} />
        </div>
      )}
    </div>
  )
}
