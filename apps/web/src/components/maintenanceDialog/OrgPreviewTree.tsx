import { useState } from 'react'
import type { OrgPreview } from './types'

interface Props {
  groups: OrgPreview[]
}

export function OrgPreviewTree({ groups }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (orgId: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      return next
    })

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        変更対象の行はありません
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {groups.map(group => {
        const isOpen = !collapsed.has(group.orgId)
        return (
          <div key={group.orgId} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Org header */}
            <button
              onClick={() => toggle(group.orgId)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-gray-400 text-xs w-3 flex-shrink-0">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
                {group.orgName}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {group.totalMembers > 0 && (
                  <span className="mr-1">{group.totalMembers}人中</span>
                )}
                <span className="text-blue-600 font-semibold">{group.affected.length}件変更</span>
              </span>
            </button>

            {/* Member list */}
            {isOpen && (
              <div className="divide-y divide-gray-100">
                {group.affected.map(person => (
                  <div key={person.rowId} className="px-3 py-2">
                    {/* Person name row */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {person.userId ? '👤' : '📋'}
                      </span>
                      <span className="text-xs font-medium text-gray-800 flex-1 truncate">
                        {person.name || '（ポジション）'}
                      </span>
                    </div>
                    {/* Field changes */}
                    <div className="space-y-0.5 pl-5">
                      {person.changes.map((change, idx) => (
                        <div key={idx} className="flex items-start gap-1 text-xs">
                          <span className="text-gray-400 flex-shrink-0 w-20 truncate">{change.label}:</span>
                          <span className="text-red-500 line-through flex-shrink-0 max-w-[100px] truncate" title={change.before}>
                            {change.before || '（空）'}
                          </span>
                          <span className="text-gray-400 flex-shrink-0">→</span>
                          <span className="text-emerald-600 font-medium flex-shrink-0 max-w-[100px] truncate" title={change.after}>
                            {change.after || '（空）'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
