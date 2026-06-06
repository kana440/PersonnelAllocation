import { useMemo } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { useStore } from '../../store/useStore'
import { aiTools } from '../../application/aiTools'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  onSuggest: (text: string) => void
  compact?: boolean
}

interface SuggestionGroup {
  label: string
  items: { text: string; prompt: string }[]
}

function buildPersonSuggestions(name: string, rows: AllocationRow[]): { text: string; prompt: string }[] {
  const suggestions: { text: string; prompt: string }[] = []

  suggestions.push({ text: `${name}さんの状態を確認`, prompt: `${name}さんの現在の状態を説明して` })

  const hasSecondmentOut = rows.some(r => r.secondmentToCompany)
  if (hasSecondmentOut) {
    suggestions.push({ text: `${name}さんの出向を転籍に変えたい`, prompt: `${name}さんは出向中ですが、出向先に転籍させたい。必要な手順を教えて` })
  }

  return suggestions
}

export function AIContextSuggestions({ onSuggest, compact = false }: Props) {
  const { chatContextRowIds } = useChatStore()
  const allocationList = useStore(s => s.allocationList)

  const groups = useMemo<SuggestionGroup[]>(() => {
    const result: SuggestionGroup[] = []

    // ── Person-specific groups ──────────────────────────────────────────────
    const byUserId = new Map<string, AllocationRow[]>()
    for (const rowId of chatContextRowIds) {
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row?.userId) continue
      const bucket = byUserId.get(row.userId) ?? []
      bucket.push(row)
      byUserId.set(row.userId, bucket)
    }

    for (const [, rows] of byUserId) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      if (!name) continue
      result.push({
        label: name,
        items: buildPersonSuggestions(name, rows),
      })
    }

    // ── General suggestions ─────────────────────────────────────────────────
    const summary = aiTools.getReviewSummary()
    const generalItems: { text: string; prompt: string }[] = []

    if (summary.errorCount > 0) {
      generalItems.push({ text: `エラー ${summary.errorCount}件を確認`, prompt: 'バリデーション問題を確認して修正提案をして' })
    }
    if (summary.changedRows > 0) {
      generalItems.push({ text: `変更 ${summary.changedRows}件をレビュー`, prompt: '今月の変更内容をレビューして' })
    }

    result.push({ label: '全般', items: generalItems })

    return result
  }, [chatContextRowIds, allocationList])

  if (groups.every(g => g.items.length === 0)) return null

  if (compact) {
    // 入力欄上部の薄いチップバー（アクティブ会話中）
    const allItems = groups.flatMap(g => g.items).slice(0, 5)
    return (
      <div className="flex flex-wrap gap-1 px-2 pt-1.5 pb-0">
        {allItems.map((item, i) => (
          <button
            key={i}
            onClick={() => onSuggest(item.prompt)}
            className="px-2 py-0.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            {item.text}
          </button>
        ))}
      </div>
    )
  }

  // EmptyState 用: グループ分けして全件表示
  return (
    <div className="w-full max-w-[260px] space-y-3">
      {groups.map((group, gi) => (
        <div key={gi}>
          <p className="text-xs font-medium text-gray-400 mb-1">{group.label}</p>
          <div className="flex flex-wrap gap-1">
            {group.items.map((item, ii) => (
              <button
                key={ii}
                onClick={() => onSuggest(item.prompt)}
                className="px-2.5 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
