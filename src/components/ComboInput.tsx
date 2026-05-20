import { useState, useRef, useEffect } from 'react'

interface Props {
  value:       string
  onChange:    (v: string) => void
  options:     string[]
  placeholder?: string
  disabled?:   boolean
  className?:  string
  hasIssue?:   boolean  // warning=orange, error=red は呼び出し元で className で制御
}

export function ComboInput({ value, onChange, options, placeholder, disabled, className, hasIssue }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  // value が外から変わったときに追従
  useEffect(() => { setInput(value) }, [value])

  // 外クリックで閉じる
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
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
    <div ref={ref} className="relative">
      <div className="flex items-center">
        <input
          type="text"
          value={input}
          disabled={disabled}
          placeholder={placeholder}
          className={baseClass}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={() => {
            // blur 時に確定（候補選択より後に発火するので少し遅延）
            setTimeout(() => { onChange(input); setOpen(false) }, 150)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onChange(input); setOpen(false) }
            if (e.key === 'Escape') { setInput(value); setOpen(false) }
          }}
        />
        {!disabled && options.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
            className="absolute right-1 text-gray-400 hover:text-gray-600 px-1"
          >
            ▾
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
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
