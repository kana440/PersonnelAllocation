import { useState, useRef, useEffect } from 'react'
import type { IAIChatService, ChatMessage } from '../../ports'
import { mockChatService } from '../../infrastructure/ai/mockChatService'

interface Props {
  onClose: () => void
  chatService?: IAIChatService
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { role: 'ai',  text: 'こんにちは！人事異動の操作についてサポートします。組織異動・出向・兼務追加・昇降格などについてご質問ください。' },
  { role: 'user', text: '山田さんの発令後の所属を教えて' },
  { role: 'ai',  text: '山田 太郎さん（SF014）は発令前・発令後ともにA社 営業本部の本部長（B6）です。今回の発令では変更はありません。' },
  { role: 'user', text: '業務推進課が廃止になるけど、メンバーの確認ができてる？' },
  { role: 'ai',  text: '業務推進課（廃止予定）のメンバー2名の対応状況です：\n• 山口 陽菜さん → 経営企画部へ異動（設定済み ✓）\n• 松本 翔さん → 事業戦略部（新設）へ異動（設定済み ✓）\n全員の対応が完了しています。' },
]

export function AIChatDrawer({ onClose, chatService = mockChatService }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [input,    setInput]    = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    const next: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setIsLoading(true)
    try {
      const reply = await chatService.send(next, text)
      setMessages(prev => [...prev, { role: 'ai', text: reply }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-sm font-semibold text-gray-700">AI アシスタント</span>
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-tight">モック</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">AI</div>
            )}
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
            <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm text-gray-400 text-xs">入力中…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="メッセージを入力… (Enter で送信)"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400"
          disabled={isLoading}
        />
        <button
          onClick={send}
          disabled={isLoading || !input.trim()}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs rounded-lg transition-colors flex-shrink-0"
        >
          送信
        </button>
      </div>
    </div>
  )
}
