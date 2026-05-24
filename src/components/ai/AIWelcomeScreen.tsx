import { useRef, useEffect } from 'react'
import type { ChatMessage, WidgetCallbacks } from '../../application/aiTypes'
import { AIMessageBubble } from './AIMessageBubble'

interface PromptCard {
  id: string
  icon: string
  title: string
  description: string
}

const PROMPTS_WITH_DATA: PromptCard[] = [
  { id: 'check-dept',   icon: '🏢', title: '担当部門を確認する',       description: '部門名を入力してメンバーの組織ツリーを表示します' },
  { id: 'report-line',  icon: '📋', title: 'レポートラインを確認する',  description: '指定した方の直属レポートメンバーを表示します（他組織含む）' },
  { id: 'promote',      icon: '⬆️', title: '昇進する人を選択',          description: '昇格対象者の名前を入力して差分を確認・適用します' },
  { id: 'check-impact', icon: '🔍', title: '担当外への影響をチェック',  description: '担当部門以外に意図しない変更がないか確認します' },
  { id: 'export-excel', icon: '📤', title: 'Excelをエクスポート',        description: '変更内容を確認してExcelファイルで保存します' },
]

interface Props {
  isDataLoaded: boolean
  onPromptClick: (id: string) => void
  onImportExcel?: () => void
  messages?: ChatMessage[]
  activeWidgetMsgId?: string | null
  callbacks?: WidgetCallbacks
}

export function AIWelcomeScreen({ isDataLoaded, onPromptClick, onImportExcel, messages = [], activeWidgetMsgId, callbacks }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  if (!isDataLoaded) {
    return (
      <div className="h-full flex flex-col">
        {/* Scrollable area: intro bubble + conversation messages */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {/* Fixed intro bubble */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 shadow-sm">
                AI
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-gray-800 leading-relaxed">
                  こんにちは。<span className="font-semibold">人事異動管理アシスタント</span>です。
                </p>
                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                  要員配置リストの編集サポートや、異動作業に関する質問にお答えできます。
                  まずExcelを読み込むか、質問をどうぞ。
                </p>
              </div>
            </div>

            {/* Inline messages (continue from intro) */}
            {messages.map(msg => (
              <AIMessageBubble
                key={msg.id}
                message={msg}
                isActiveWidget={msg.id === activeWidgetMsgId}
                callbacks={callbacks ?? {} as WidgetCallbacks}
              />
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Action chips — always visible at bottom */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <div className="max-w-2xl mx-auto flex flex-wrap gap-2">
            {onImportExcel && (
              <button
                onClick={onImportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-full hover:bg-blue-700 transition-colors"
              >
                <span>📂</span>
                <span>Excelを読み込んで開始</span>
              </button>
            )}
            <button
              onClick={() => onPromptClick('excel-help')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-full hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <span>❓</span>
              <span>Excelの形式を確認する</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Data loaded: show card prompts
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">AI</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">データが読み込まれています</h2>
          <p className="mt-1.5 text-sm text-gray-500">何を手伝いましょうか？</p>
        </div>
        <div className="grid gap-3 grid-cols-1">
          {PROMPTS_WITH_DATA.map(p => (
            <button
              key={p.id}
              onClick={() => onPromptClick(p.id)}
              className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">{p.icon}</div>
              <div className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{p.title}</div>
              <div className="text-xs text-gray-500 mt-1">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
