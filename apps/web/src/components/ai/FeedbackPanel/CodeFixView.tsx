import { useState } from 'react'
import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'
import type { AiCodeFixRequest } from '../../../infrastructure/ai/feedback/types'

interface Props {
  refresh:   number
  onRefresh: () => void
}

const KIND_LABEL: Record<string, string> = {
  tool_logic_bug: 'ロジックバグ',
  missing_tool:   '機能欠如',
}

function buildMarkdown(fixes: AiCodeFixRequest[]): string {
  const lines = [
    '# AI フィードバック由来のコード修正タスク',
    '',
    `生成日: ${new Date().toLocaleDateString('ja-JP')}`,
    '',
  ]
  fixes.forEach((f, i) => {
    lines.push(`## ${i + 1}. [${f.classification}] ${f.title}`)
    if (f.targetKey) lines.push(`**対象ツール**: ${f.targetKey}`)
    lines.push(`**問題**: ${f.description}`)
    lines.push(`**期待される動作**: ${f.expectedBehavior}`)
    lines.push('')
  })
  return lines.join('\n')
}

export function CodeFixView({ refresh: _, onRefresh }: Props) {
  const allFixes   = feedbackStore.getCodeFixes()
  const pending    = allFixes.filter(f => f.status === 'pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied,   setCopied]   = useState(false)

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll   = () => setSelected(new Set(pending.map(f => f.id)))
  const clearSelect = () => setSelected(new Set())

  const handleExport = async () => {
    const toExport = pending.filter(f => selected.has(f.id))
    if (toExport.length === 0) return
    const md = buildMarkdown(toExport)
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDismiss = (id: string) => {
    const fix = allFixes.find(f => f.id === id)
    if (!fix) return
    feedbackStore.saveCodeFix({ ...fix, status: 'dismissed' })
    onRefresh()
  }

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
        <p className="text-2xl">🐛</p>
        <p className="text-sm font-medium text-gray-600">未解決のCode Fix依頼はありません</p>
        <p className="text-xs text-gray-400">
          ツールのバグや機能不足が訂正として記録されると<br />ここに表示されます
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <button onClick={selectAll}   className="text-xs text-blue-500 hover:text-blue-700">全選択</button>
          <button onClick={clearSelect} className="text-xs text-gray-400 hover:text-gray-600">解除</button>
        </div>
        <button
          disabled={selected.size === 0}
          onClick={() => void handleExport()}
          className="text-xs px-3 py-1 bg-gray-700 text-white rounded-lg disabled:opacity-40 hover:bg-gray-900 transition-colors"
        >
          {copied ? '✅ コピー済み' : `📋 Markdownコピー (${selected.size}件)`}
        </button>
      </div>

      {/* リスト */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pending.map(f => (
          <div
            key={f.id}
            className={`border rounded-xl p-3 cursor-pointer transition-colors ${
              selected.has(f.id)
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
            onClick={() => toggle(f.id)}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                onClick={e => e.stopPropagation()}
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                    {KIND_LABEL[f.classification] ?? f.classification}
                  </span>
                  {f.targetKey && (
                    <code className="text-xs text-gray-500 bg-gray-100 px-1 rounded">{f.targetKey}</code>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 mb-0.5">{f.title}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{f.description}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDismiss(f.id) }}
                className="text-xs text-gray-300 hover:text-gray-500 flex-shrink-0"
                title="却下"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
