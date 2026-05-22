import { useState } from 'react'

interface Props {
  onSubmit: (text: string) => void
  disabled: boolean
}

export function AIInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v || disabled) return
    setValue('')
    onSubmit(v)
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={disabled ? '処理中...' : 'メッセージを入力... (Enter で送信)'}
          disabled={disabled}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          送信
        </button>
      </form>
    </div>
  )
}
