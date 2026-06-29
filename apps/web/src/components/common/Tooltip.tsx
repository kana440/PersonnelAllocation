import { useState, useRef }  from 'react'
import { createPortal }      from 'react-dom'

interface TooltipProps {
  label:      string
  children:   React.ReactNode
  className?: string
}

/**
 * ホバー時に全文をポータル表示するツールチップ。
 * overflow:hidden 親に対応するため createPortal + fixed 座標で描画する。
 * 400ms 遅延でマウス移動中の誤表示を防ぐ。
 */
export function Tooltip({ label, children, className }: TooltipProps) {
  const [pos, setPos]  = useState<{ top: number; left: number } | null>(null)
  const wrapRef        = useRef<HTMLSpanElement>(null)
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    }, 400)
  }
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPos(null)
  }

  return (
    <span
      ref={wrapRef}
      className={`inline-flex min-w-0 ${className ?? ''}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {pos && createPortal(
        <span
          className="pointer-events-none fixed z-[9999] bg-gray-800 text-white text-[11px] leading-tight rounded px-2 py-1 whitespace-nowrap shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  )
}
