import { useRef, useState } from 'react'

interface Props {
  onSubmit: (text: string) => void
  disabled: boolean
}

export function AIInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const v = value.trim()
    if (!v || disabled) return
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSubmit(v)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // 内容に合わせて高さを自動調整（最大 8行分）
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="max-w-2xl mx-auto flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '処理中...' : 'メッセージを入力... (Enter で送信 / Shift+Enter で改行)'}
          disabled={disabled}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 transition-colors resize-none overflow-y-auto leading-5"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shrink-0"
        >
          送信
        </button>
      </div>
    </div>
  )
}
