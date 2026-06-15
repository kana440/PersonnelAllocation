import { useState } from 'react'
import { useOrgView } from '../OrgViewContext'
import { subtreeRowCount, hasAnyRows } from '../panel/helpers'
import { RowCard } from '../panel/RowCard'

interface TreeNodeProps {
  orgId:      string
  treeId:     string
  depth:      number
  onNavigate: (orgId: string) => void
  isRoot?:    boolean
}

export function TreeNode({ orgId, treeId, depth, onNavigate, isRoot }: TreeNodeProps) {
  const { organizations, positionTreeByOrgId } = useOrgView()
  const [open, setOpen] = useState(depth < 2)

  const entries   = positionTreeByOrgId.get(orgId) ?? []
  const childOrgs = organizations.filter(
    o => o.parentId === orgId && hasAnyRows(o.id, organizations, positionTreeByOrgId),
  )
  const org        = organizations.find(o => o.id === orgId)
  const totalCount = subtreeRowCount(orgId, organizations, positionTreeByOrgId)

  if (!org) return null
  if (!isRoot && entries.length === 0 && childOrgs.length === 0) return null

  const body = (open || isRoot) && (
    <div className={!isRoot ? 'pl-3 border-l border-gray-100 ml-2' : undefined}>
      {entries.map(entry => (
        <RowCard
          key={entry.row.rowId}
          entry={entry}
          orgId={orgId}
          panelId={treeId}
        />
      ))}
      {childOrgs.map(child => (
        <TreeNode
          key={child.id}
          orgId={child.id}
          treeId={treeId}
          depth={depth + 1}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )

  if (isRoot) return <div>{body}</div>

  return (
    <div>
      {/* 組織ヘッダー: シングルクリック=開閉, ダブルクリック=このorgをウィンドウルートに */}
      <div
        className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(v => !v)}
        onDoubleClick={e => { e.stopPropagation(); onNavigate(orgId) }}
      >
        <span className="text-[10px] text-gray-400 w-3 text-center flex-shrink-0">
          {open ? '▼' : '▶'}
        </span>
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{org.name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0">({totalCount}名)</span>
        <span
          className="text-[9px] text-gray-300 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
          title="ダブルクリックでこの組織に絞り込む"
        >⤵</span>
      </div>
      {body}
    </div>
  )
}
