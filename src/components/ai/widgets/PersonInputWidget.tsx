import { useState } from 'react'

interface Props {
  isActive: boolean
  onSubmit: (names: string) => void
}

export function PersonInputWidget({ isActive, onSubmit }: Props) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setValue('')
    onSubmit(v)
  }

  if (!isActive) return null

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="例: 山田太郎, 鈴木花子"
        className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        autoFocus
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        検索
      </button>
    </form>
  )
}
