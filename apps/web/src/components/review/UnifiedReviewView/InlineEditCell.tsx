import { useState, useRef, useEffect } from 'react'

interface Props {
  rowId:    number
  value:    string
  options?: string[]
  onCommit: (value: string) => void
  placeholder?: string
}

export function InlineEditCell({ rowId, value, options, onCommit, placeholder = 'クリックで入力' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  if (editing) {
    return (
      <td className="px-1 py-1 text-xs border-b border-gray-100 min-w-[120px]">
        <input
          ref={inputRef}
          list={options ? `inline-opts-${rowId}` : undefined}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setEditing(false); setDraft(value) }
          }}
          className="w-full border border-blue-400 rounded px-1.5 py-0.5 text-xs focus:outline-none"
          autoFocus
        />
        {options && (
          <datalist id={`inline-opts-${rowId}`}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        )}
      </td>
    )
  }

  return (
    <td
      className="px-2 py-1.5 text-xs border-b border-gray-100 whitespace-nowrap min-w-[120px] cursor-pointer hover:bg-blue-50 group"
      onClick={() => setEditing(true)}
    >
      {value
        ? <span>{value}</span>
        : <span className="text-gray-300 group-hover:text-gray-400 text-[10px]">{placeholder}</span>
      }
    </td>
  )
}
