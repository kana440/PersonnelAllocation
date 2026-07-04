import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { AIChatDrawer } from '../ai/AIChatDrawer'

const PANEL_W = 360
const PANEL_H = 560

export function FloatingAIChat() {
  const [open,     setOpen]     = useState(false)
  const [position, setPosition] = useState({ x: 24, y: 24 })   // right/bottom offset
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const unreadCount = useChatStore(s =>
    s.messages.filter(m => m.role === 'ai').length
  )

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: position.x, origY: position.y,
    }
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = ev.clientX - draggingRef.current.startX
      const dy = ev.clientY - draggingRef.current.startY
      setPosition({
        x: Math.max(8, draggingRef.current.origX - dx),
        y: Math.max(8, draggingRef.current.origY - dy),
      })
    }
    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [position])

  return (
    <>
      {/* 展開パネル */}
      {open && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{
            right:  position.x,
            bottom: position.y + 56,
            width:  PANEL_W,
            height: PANEL_H,
          }}
        >
          {/* ドラッグハンドル（タイトルバー） */}
          <div
            className="h-6 flex-shrink-0 bg-gray-100 border-b border-gray-200 cursor-move flex items-center px-2 select-none"
            onMouseDown={handleDragStart}
          >
            <span className="text-[10px] text-gray-400 font-medium">AI アシスタント</span>
            <span className="ml-auto text-[10px] text-gray-400">↔ ドラッグで移動</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AIChatDrawer onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* フローティングボタン */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ right: position.x, bottom: position.y }}
        className={`fixed z-50 w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-95 ${
          open
            ? 'bg-blue-600 text-white'
            : 'bg-white text-blue-600 border-2 border-blue-200 hover:border-blue-400'
        }`}
        title={open ? 'AIチャットを閉じる' : 'AIアシスタントを開く'}
      >
        {open ? '✕' : '💬'}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
