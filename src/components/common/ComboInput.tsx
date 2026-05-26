import { useState, useRef, useEffect, useLayoutEffect } from 'react'

interface Props {
  value:        string
  onChange:     (v: string) => void
  options:      string[]
  placeholder?: string
  disabled?:    boolean
  className?:   string
  hasIssue?:    boolean
}

export function ComboInput({ value, onChange, options, placeholder, disabled, className, hasIssue }: Props) {
  const [open,   setOpen]   = useState(false)
  const [input,  setInput]  = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})

  useEffect(() => { setInput(value) }, [value])

  // ドロップダウン位置を input の getBoundingClientRect から fixed 座標で計算
  useLayoutEffect(() => {
    if (!open || !inputRef.current) return
    const rect   = inputRef.current.getBoundingClientRect()
    const maxH   = 160
    const below  = window.innerHeight - rect.bottom
    const width  = Math.max(rect.width, 120)
    if (below >= maxH || rect.top < maxH) {
      setDropStyle({ top: rect.bottom + 2, left: rect.left, width })
    } else {
      setDropStyle({ bottom: window.innerHeight - rect.top + 2, left: rect.left, width })
    }
  }, [open])

  // 外クリックで閉じる（fixed ドロップダウンも考慮）
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        !containerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const filtered = options.filter(o =>
    !input || o.toLowerCase().includes(input.toLowerCase())
  )

  const commit = (v: string) => {
    setInput(v)
    onChange(v)
    setOpen(false)
  }

  const baseClass = `w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
    disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
  } ${
    hasIssue ? 'border-orange-400 focus:ring-orange-300' : 'border-gray-300 focus:ring-blue-300'
  } ${className ?? ''}`

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={input}
        disabled={disabled}
        placeholder={placeholder}
        className={baseClass}
        onFocus={() => { if (!disabled) setOpen(true) }}
        onChange={e => { setInput(e.target.value); setOpen(true); onChange(e.target.value) }}
        onBlur={() => {
          setTimeout(() => { onChange(input); setOpen(false) }, 150)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { onChange(input); setOpen(false) }
          if (e.key === 'Escape') { setInput(value); setOpen(false) }
        }}
      />

      {open && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto"
          style={dropStyle}
        >
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(opt) }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-blue-50 ${
                opt === value ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
