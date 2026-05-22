import { useState } from 'react'
import type { OrgTreeNode, PersonInfo } from '../ai/types'

interface Props {
  node: OrgTreeNode
  defaultExpanded?: boolean
  depth?: number
  onPersonClick?: (person: PersonInfo) => void
}

export function OrgTree({ node, defaultExpanded = false, depth = 0, onPersonClick }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const total    = countTotal(node)
  const hasItems = node.members.length > 0 || node.children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-1 py-1.5 px-2 hover:bg-gray-50 rounded text-left select-none"
      >
        <span className="text-gray-400 text-xs w-4 text-center flex-shrink-0">
          {hasItems ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span className="text-sm font-medium text-gray-700">{node.orgName}</span>
        <span className="text-xs text-gray-400 ml-1">{total} 名</span>
      </button>

      {expanded && (
        <div className={depth < 3 ? 'ml-4 border-l border-gray-100 pl-1' : 'ml-4 pl-1'}>
          {node.members.map(m => (
            <div
              key={m.userId}
              className={`flex items-center gap-2 py-1 px-2 text-sm text-gray-600 rounded ${onPersonClick ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
              onClick={() => onPersonClick?.(m)}
            >
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700 font-semibold flex-shrink-0">
                {m.name.charAt(0)}
              </div>
              <span className="flex-1 min-w-0 truncate">{m.name}</span>
              <span className="text-xs text-gray-400 font-mono">{m.userId}</span>
            </div>
          ))}

          {node.children.map(child => (
            <OrgTree
              key={child.orgId}
              node={child}
              defaultExpanded={false}
              depth={depth + 1}
              onPersonClick={onPersonClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function countTotal(node: OrgTreeNode): number {
  return node.members.length + node.children.reduce((s, c) => s + countTotal(c), 0)
}
