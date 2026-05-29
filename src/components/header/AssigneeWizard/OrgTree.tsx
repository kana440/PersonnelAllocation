import { useState } from 'react'
import type { Organization } from '../../../domain/schemas'

interface ItemProps {
  org:              Organization
  allOrgs:          Organization[]
  depth:            number
  isFrontier:       boolean   // this node is a potential decision point
  useThis:          Map<string, boolean>
  orgAssignees:     Map<string, string>
  rowCounts:        Map<string, number>
  onUseThisChange:  (orgId: string, value: boolean) => void
  onAssigneeChange: (orgId: string, value: string) => void
}

export function OrgTreeItem({
  org, allOrgs, depth, isFrontier,
  useThis, orgAssignees, rowCounts,
  onUseThisChange, onAssigneeChange,
}: ItemProps) {
  const children    = allOrgs.filter(o => o.parentId === org.id && !o.isAbandoned)
  const isLeaf      = children.length === 0
  const useThisHere = useThis.get(org.id) ?? true

  // A group node = frontier + level >= 2 + (useThis OR leaf)
  const isGroupNode  = isFrontier && org.level >= 2 && (useThisHere || isLeaf)
  // Show radio selector = frontier + level >= 2 + has children (leaf can't go deeper)
  const showSelector = isFrontier && org.level >= 2 && !isLeaf

  // Children are frontier when this is level-1 (pass-through) or we're going deeper
  const childrenFrontier =
    org.level === 1 || (isFrontier && org.level >= 2 && !useThisHere && !isLeaf)

  const [expanded, setExpanded] = useState(true)
  const assignee = orgAssignees.get(org.id) ?? org.name
  const rowCount = rowCounts.get(org.id) ?? 0

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg
          ${isGroupNode ? 'bg-blue-50 border border-blue-200 my-0.5' : 'hover:bg-gray-50'}`}
        style={{ marginLeft: `${depth * 16}px` }}
      >
        {/* expand / collapse */}
        {children.length > 0 ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 text-[10px] w-4 flex-shrink-0"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* org name */}
        <span className={`text-sm flex-1 min-w-0 truncate
          ${isGroupNode ? 'font-semibold text-gray-800' : 'text-gray-500'}`}
        >
          {org.name}
        </span>

        {/* row count */}
        {isGroupNode && rowCount > 0 && (
          <span className="text-[10px] text-blue-400 tabular-nums whitespace-nowrap">
            {rowCount}行
          </span>
        )}

        {/* この階層 / 配下の階層 selector */}
        {showSelector && (
          <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
            <label className={`flex items-center gap-0.5 cursor-pointer select-none
              ${useThisHere ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}
            >
              <input
                type="radio"
                name={`depth-${org.id}`}
                checked={useThisHere}
                onChange={() => onUseThisChange(org.id, true)}
                className="w-3 h-3"
              />
              この階層
            </label>
            <label className={`flex items-center gap-0.5 cursor-pointer select-none
              ${!useThisHere ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}
            >
              <input
                type="radio"
                name={`depth-${org.id}`}
                checked={!useThisHere}
                onChange={() => onUseThisChange(org.id, false)}
                className="w-3 h-3"
              />
              配下の階層
            </label>
          </div>
        )}

        {/* assignee text input */}
        {isGroupNode && (
          <input
            type="text"
            list="assignee-datalist"
            value={assignee}
            onChange={e => onAssigneeChange(org.id, e.target.value)}
            className="border border-blue-300 rounded px-2 py-0.5 text-xs w-36
              focus:outline-none focus:border-blue-500 flex-shrink-0 bg-white"
            placeholder="担当者名"
          />
        )}
      </div>

      {/* always render children (structure context), with correct frontier flag */}
      {expanded && children.map(child => (
        <OrgTreeItem
          key={child.id}
          org={child}
          allOrgs={allOrgs}
          depth={depth + 1}
          isFrontier={childrenFrontier}
          useThis={useThis}
          orgAssignees={orgAssignees}
          rowCounts={rowCounts}
          onUseThisChange={onUseThisChange}
          onAssigneeChange={onAssigneeChange}
        />
      ))}
    </div>
  )
}
