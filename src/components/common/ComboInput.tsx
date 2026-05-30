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
  const [open,  setOpen]  = useState(false)
  const [input, setInput] = useState(value)
  // true = ユーザーが文字入力した → options を絞り込む
  // false = 開いた直後 or 選択後 → options を全件表示
  const [typed, setTyped] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})

  useEffect(() => { setInput(value) }, [value])

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return
    const rect  = inputRef.current.getBoundingClientRect()
    const maxH  = 160
    const below = window.innerHeight - rect.bottom
    const width = Math.max(rect.width, 120)
    if (below >= maxH || rect.top < maxH) {
      setDropStyle({ top: rect.bottom + 2, left: rect.left, width })
    } else {
      setDropStyle({ bottom: window.innerHeight - rect.top + 2, left: rect.left, width })
    }
  }, [open])

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

  // typed のときだけ絞り込む。未タイプ（開いた直後）は全件表示。
  const filtered = typed
    ? options.filter(o => o.toLowerCase().includes(input.toLowerCase()))
    : options

  const commit = (v: string) => {
    setInput(v)
    setTyped(false)
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
        onFocus={() => {
          if (disabled) return
          setTyped(false)   // 開いた瞬間は全件表示
          setOpen(true)
        }}
        onChange={e => {
          setInput(e.target.value)
          setTyped(true)    // 文字入力が始まったら絞り込みモード
          setOpen(true)
          onChange(e.target.value)
        }}
        onBlur={() => {
          setTimeout(() => {
            onChange(input)
            setTyped(false)
            setOpen(false)
          }, 150)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { onChange(input); setTyped(false); setOpen(false) }
          if (e.key === 'Escape') { setInput(value); setTyped(false); setOpen(false) }
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
