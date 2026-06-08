import { useState } from 'react'
import { TOOL_ADMIN_META } from '../../../infrastructure/skills/toolAdminMeta'
import { toolRegistry } from '../../../infrastructure/ai/toolRegistry'

const KINDS = ['read', 'render', 'confirm'] as const
const KIND_LABEL: Record<string, string> = {
  read:    '読み取り',
  render:  '表示',
  confirm: '確認（変更あり）',
}
const KIND_BADGE: Record<string, string> = {
  read:    'bg-sky-100 text-sky-700',
  render:  'bg-purple-100 text-purple-700',
  confirm: 'bg-amber-100 text-amber-700',
}

const ALL_TOOLS = KINDS.flatMap(kind =>
  toolRegistry.definitions
    .filter(d => toolRegistry.getEntry(d.function.name)?.kind === kind)
    .map(d => ({
      name: d.function.name,
      kind,
      meta: TOOL_ADMIN_META[d.function.name],
    }))
)

interface Props {
  onInsert: (text: string) => void
}

export function ToolPicker({ onInsert }: Props) {
  const [query, setQuery] = useState('')
  const [flash,  setFlash]  = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? ALL_TOOLS.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.meta?.basis.toLowerCase().includes(q) ?? false) ||
        (t.meta?.action.toLowerCase().includes(q) ?? false)
      )
    : ALL_TOOLS

  const grouped = KINDS.map(kind => ({
    kind,
    tools: filtered.filter(t => t.kind === kind),
  })).filter(g => g.tools.length > 0)

  const handleInsert = (name: string) => {
    onInsert(`\`${name}\``)
    setFlash(name)
    setTimeout(() => setFlash(null), 1200)
  }

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      {/* 検索バー */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-[10px] font-medium text-gray-500 flex-shrink-0">ツールを挿入</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="名前・説明で検索…"
          className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
          >✕</button>
        )}
      </div>

      {/* ツール一覧 */}
      <div className="max-h-44 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-400">一致するツールがありません</div>
        ) : (
          grouped.map(({ kind, tools }) => (
            <div key={kind} className="px-2 py-1.5 border-b border-gray-100 last:border-0">
              <span className={`inline-block text-[10px] px-1.5 py-0 rounded font-medium mb-1 ${KIND_BADGE[kind]}`}>
                {KIND_LABEL[kind]}
              </span>
              <div className="space-y-0.5">
                {tools.map(({ name, meta }) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault() // テキストエリアのフォーカスを保持
                      handleInsert(name)
                    }}
                    className="w-full flex items-start gap-1.5 text-left py-0.5 px-1 rounded hover:bg-blue-50 transition-colors group"
                  >
                    <span className={`flex-shrink-0 font-mono text-[11px] px-1 rounded leading-snug mt-0.5 transition-colors ${
                      flash === name
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                    }`}>
                      {flash === name ? '✓' : name}
                    </span>
                    {meta && (
                      <span className="text-[11px] text-gray-400 leading-snug min-w-0 truncate">
                        {meta.basis} → {meta.action}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
