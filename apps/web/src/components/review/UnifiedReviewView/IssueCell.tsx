import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAcknowledgmentStore } from '../../../infrastructure/acknowledgmentStore'
import { makeWarningKey } from '@personnel/domain/acknowledgment'
import type { ValidationIssue } from '@personnel/domain/rules/validate/validateRow'
import { getIssueShortLabel } from './helpers'

const MAX_SHOW = 3

interface Props { rowId: number; issues: ValidationIssue[] }

export function IssueCell({ rowId, issues }: Props) {
  const { _items, acknowledge, unacknowledge } = useAcknowledgmentStore(
    useShallow(s => ({ _items: s._items, acknowledge: s.acknowledge, unacknowledge: s.unacknowledge }))
  )
  const [expanded, setExpanded] = useState(false)

  if (issues.length === 0) {
    return (
      <td className="px-2 py-1.5 text-xs border-b border-gray-100 overflow-hidden">
        <span className="text-gray-300">—</span>
      </td>
    )
  }

  const shown      = expanded ? issues : issues.slice(0, MAX_SHOW)
  const hiddenCount = issues.length - MAX_SHOW

  return (
    <td className="px-2 py-1.5 text-xs border-b border-gray-100">
      <div className="flex flex-wrap gap-0.5 items-center">
        {shown.map((issue, i) => {
          if (issue.level === 'error') {
            return (
              <span
                key={i}
                title={issue.message}
                className="inline-block px-1 py-0.5 rounded border text-[9px] bg-red-50 text-red-600 border-red-200 whitespace-nowrap"
              >
                {getIssueShortLabel(issue.message)}
              </span>
            )
          }
          const wkey = makeWarningKey(rowId, issue.message)
          const acked = _items.has(wkey)
          return (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); acked ? unacknowledge(wkey) : acknowledge(wkey) }}
              title={issue.message}
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] whitespace-nowrap transition-colors ${
                acked
                  ? 'bg-green-50 text-green-600 border-green-200'
                  : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
              }`}
            >
              {getIssueShortLabel(issue.message)}
              {acked && <span className="text-[8px]">✓</span>}
            </button>
          )
        })}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(true) }}
            className="inline-block px-1 py-0.5 rounded border text-[9px] bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 whitespace-nowrap"
          >
            +{hiddenCount}件
          </button>
        )}
        {expanded && issues.length > MAX_SHOW && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(false) }}
            className="inline-block px-1 py-0.5 rounded border text-[9px] bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 whitespace-nowrap"
          >
            ▲
          </button>
        )}
      </div>
    </td>
  )
}
