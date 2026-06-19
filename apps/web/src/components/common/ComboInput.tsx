import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { FieldStrictness } from '@personnel/domain/optionStrictness'

interface Props {
  value:           string
  onChange:        (v: string) => void
  options:         string[]
  /** 条件に合致しないが表示するオプション（下段に表示） */
  invalidOptions?: string[]
  /**
   * 'strict': 無効選択肢は選択不可（cursor-not-allowed）
   * 'guide' : 無効選択肢はグレーだが選択可（デフォルト）
   * 'free'  : 全選択肢を均等に表示
   */
  strictness?:     FieldStrictness
  placeholder?:    string
  disabled?:       boolean
  className?:      string
  hasIssue?:       boolean
  modified?:       boolean
}

export function ComboInput({ value, onChange, options, invalidOptions = [], strictness = 'guide', placeholder, disabled, className, hasIssue, modified }: Props) {
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

  const q = input.toLowerCase()
  const filteredValid   = typed ? options.filter(o => o.toLowerCase().includes(q))        : options
  const filteredInvalid = typed ? invalidOptions.filter(o => o.toLowerCase().includes(q)) : invalidOptions

  const commit = (v: string) => {
    setInput(v)
    setTyped(false)
    onChange(v)
    setOpen(false)
  }

  const baseClass = `w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
    disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
  } ${
    hasIssue ? 'border-orange-400 focus:ring-orange-300' : modified ? 'border-amber-400 focus:ring-amber-200' : 'border-gray-300 focus:ring-blue-300'
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

      {open && (filteredValid.length > 0 || filteredInvalid.length > 0) && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto"
          style={dropStyle}
        >
          {filteredValid.map(opt => (
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
          {filteredInvalid.length > 0 && (
            <>
              {filteredValid.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 border-t border-gray-100">
                  <span className="text-[9px] text-gray-400">その他</span>
                </div>
              )}
              {filteredInvalid.map(opt => {
                const isStrict = strictness === 'strict'
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={isStrict}
                    onMouseDown={isStrict ? undefined : e => { e.preventDefault(); commit(opt) }}
                    className={`w-full text-left px-2 py-1 text-xs ${
                      isStrict
                        ? 'text-gray-300 cursor-not-allowed'
                        : `text-gray-400 hover:bg-gray-50 ${opt === value ? 'font-medium text-gray-600 bg-gray-50' : ''}`
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
