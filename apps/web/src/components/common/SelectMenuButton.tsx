import { useState, useRef, useEffect } from 'react'

export interface SelectMenuOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value:      T
  options:    ReadonlyArray<SelectMenuOption<T>>
  onChange:   (value: T) => void
  title?:     string
  className?: string
}

/**
 * 「現在値を表示するボタン＋クリックでポップアップメニュー」という単一の操作言語で
 * 選択肢を選ばせる共通コンポーネント。2択のトグルにも、選択肢が多いドロップダウンにも
 * 同じ見た目・操作感で使え、ネイティブ <select> の見た目差やボタン列の横伸びを避けられる。
 */
export function SelectMenuButton<T extends string>({ value, options, onChange, title, className }: Props<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = options.find(o => o.value === value)

  return (
    <div ref={containerRef} className={`relative inline-block flex-shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={title}
        className="flex items-center gap-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-600 hover:bg-gray-50 font-medium transition-colors whitespace-nowrap"
      >
        <span>{current?.label ?? value}</span>
        <span className="text-[9px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-max py-1">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                o.value === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
