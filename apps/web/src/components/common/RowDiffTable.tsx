import { useState } from 'react'
import type { RowChangeSummary } from '@personnel/domain/diffMerge'
import { ALLOCATION_LIST_FIELDS } from '@personnel/domain/csvImport/allocationList/labels'

// fieldKey → 日本語ラベル（_新 サフィックスを除去）
const FIELD_LABEL_MAP = new Map(
  ALLOCATION_LIST_FIELDS.map(f => [f.key, (f.header ?? f.key).replace(/_新$/, '')])
)
const fieldLabel = (key: string) => FIELD_LABEL_MAP.get(key) ?? key

const KIND_BADGE: Record<RowChangeSummary['kind'], { label: string; cls: string }> = {
  added:    { label: '追加', cls: 'bg-green-100 text-green-700' },
  removed:  { label: '削除', cls: 'bg-red-100   text-red-700'  },
  modified: { label: '変更', cls: 'bg-yellow-100 text-yellow-700' },
}

interface Props {
  diffs:       RowChangeSummary[]
  maxVisible?: number
}

export function RowDiffTable({ diffs, maxVisible = 200 }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const added    = diffs.filter(d => d.kind === 'added').length
  const removed  = diffs.filter(d => d.kind === 'removed').length
  const modified = diffs.filter(d => d.kind === 'modified').length

  if (diffs.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-4">
        変更はありません
      </div>
    )
  }

  const toggleRow = (rowId: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }

  const visible = diffs.slice(0, maxVisible)
  const hidden  = diffs.length - visible.length

  return (
    <div className="flex flex-col gap-2">
      {/* サマリーバー */}
      <div className="flex items-center gap-2 text-xs">
        {added   > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">+{added} 追加</span>}
        {modified > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">△{modified} 変更</span>}
        {removed > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">−{removed} 削除</span>}
        {diffs.length === 0 && <span className="text-gray-400">変更なし</span>}
      </div>

      {/* 差分テーブル */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {visible.map(d => {
          const badge = KIND_BADGE[d.kind]
          const expanded = expandedIds.has(d.rowId)
          return (
            <div key={d.rowId} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                onClick={() => d.kind === 'modified' ? toggleRow(d.rowId) : undefined}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${d.kind === 'modified' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium text-[10px] ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="font-medium text-gray-800 truncate">{d.displayName}</span>
                {d.orgCode && <span className="text-gray-400 shrink-0">{d.orgCode}</span>}
                {d.kind === 'modified' && (
                  <>
                    <span className="text-gray-400 shrink-0">{d.changes.length}フィールド変更</span>
                    <span className="ml-auto text-gray-400 shrink-0">{expanded ? '▲' : '▼'}</span>
                  </>
                )}
              </button>
              {/* フィールド差分（modified のみ展開表示） */}
              {d.kind === 'modified' && expanded && (
                <div className="bg-gray-50 border-t border-gray-100 px-4 py-2">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left font-medium pb-1 w-32">フィールド</th>
                        <th className="text-left font-medium pb-1">変更前</th>
                        <th className="text-center pb-1 w-6">→</th>
                        <th className="text-left font-medium pb-1">変更後</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.changes.map(ch => (
                        <tr key={ch.fieldKey} className="border-t border-gray-100">
                          <td className="py-0.5 text-gray-500 font-medium">{fieldLabel(ch.fieldKey)}</td>
                          <td className="py-0.5 text-red-600 font-mono">{ch.before ?? '（空）'}</td>
                          <td className="py-0.5 text-center text-gray-300">→</td>
                          <td className="py-0.5 text-green-700 font-mono">{ch.after ?? '（空）'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        {hidden > 0 && (
          <div className="px-3 py-2 text-xs text-gray-400 text-center bg-gray-50">
            他 {hidden.toLocaleString()} 行は省略されています
          </div>
        )}
      </div>
    </div>
  )
}
