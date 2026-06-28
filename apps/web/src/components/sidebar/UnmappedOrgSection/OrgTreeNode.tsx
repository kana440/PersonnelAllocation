import { useState } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person }        from '@personnel/domain/schemas'

export interface TreeNode {
  orgId:         string
  orgName:       string
  directRows:    AllocationRow[]
  subtreeRowIds: number[]
  subtreeCount:  number
  children:      TreeNode[]
}

interface Props {
  node:           TreeNode
  depth:          number
  selectedRowIds: Set<number>
  personBySfId:   Map<string, Person>
  onToggleRow:    (id: number) => void
  onToggleAll:    (ids: number[], select: boolean) => void
  onAssign:       (ids: number[], label: string) => void
}

function personName(row: AllocationRow, personBySfId: Map<string, Person>): string {
  const p = row.userId ? personBySfId.get(row.userId) : undefined
  return p?.name ?? ([row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）')
}

function setDragData(e: React.DragEvent, rowIds: number[], label: string) {
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('application/x-unmapped-bulk', '1')
  e.dataTransfer.setData('application/json', JSON.stringify({
    rowIds,
    prevOrgName:     label,
    fromOrgId:       '',
    fromCompanyId:   '',
    affiliationType: 'primary',
  }))
}

export function OrgTreeNode({
  node, depth, selectedRowIds, personBySfId, onToggleRow, onToggleAll, onAssign,
}: Props) {
  // 最上位ノードのみ初期展開、配下は畳んだ状態でスタート
  const [expanded, setExpanded] = useState(depth === 0)

  const { orgName, directRows, subtreeCount, children } = node
  const hasDirectMembers = directRows.length > 0

  // 直属メンバーのみが操作対象（サブツリーは含まない）
  const directRowIds      = directRows.map(r => r.rowId)
  const selectedInDirect  = directRowIds.filter(id => selectedRowIds.has(id))
  const allDirectSelected = selectedInDirect.length === directRowIds.length && directRowIds.length > 0
  const someSelected      = selectedInDirect.length > 0

  const assignIds   = someSelected ? selectedInDirect : directRowIds
  const assignLabel = someSelected ? `${selectedInDirect.length}名 (${orgName})` : orgName

  const indent = { paddingLeft: depth > 0 ? `${depth * 10}px` : 0 }

  return (
    <div>
      {/* ── ノードヘッダ ─────────────────────────────────────── */}
      <div className="flex items-center gap-0.5" style={indent}>

        {/* 直属メンバーがある場合のみ: 全選択チェックボックス */}
        {hasDirectMembers ? (
          <input
            type="checkbox"
            checked={allDirectSelected}
            onChange={e => onToggleAll(directRowIds, e.target.checked)}
            className="flex-shrink-0 w-3 h-3 accent-orange-500 cursor-pointer"
            title="直属メンバー全選択"
          />
        ) : (
          // 中間コンテナノード: チェックボックスなし（インデント揃え用スペース）
          <span className="flex-shrink-0 w-3" />
        )}

        {/* 組織名ボタン（展開トグル & ドラッグ元は直属メンバーのみ） */}
        <button
          draggable={hasDirectMembers}
          onDragStart={hasDirectMembers
            ? e => setDragData(e, directRowIds, orgName)
            : undefined
          }
          onClick={() => setExpanded(v => !v)}
          className={`flex-1 flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-orange-50 text-xs transition-colors min-w-0 ${
            hasDirectMembers
              ? 'text-gray-700 cursor-grab active:cursor-grabbing'
              : 'text-gray-500 cursor-pointer'
          }`}
        >
          <span className="text-gray-400 flex-shrink-0 text-[10px]">
            {(children.length > 0 || hasDirectMembers) ? (expanded ? '▾' : '▸') : '·'}
          </span>
          <span className="truncate flex-1">{orgName}</span>
          <span className="text-gray-400 flex-shrink-0 text-[10px] text-right">
            {someSelected && (
              <span className="text-orange-500">{selectedInDirect.length}/</span>
            )}
            {subtreeCount}名
            {children.length > 0 && directRows.length > 0 && (
              <span className="text-gray-300 ml-0.5">（直下{directRows.length}名）</span>
            )}
          </span>
        </button>

        {/* 直属メンバーがある場合のみ: 割当ボタン */}
        {hasDirectMembers && (
          <button
            onClick={() => onAssign(assignIds, assignLabel)}
            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors whitespace-nowrap"
            title={someSelected ? `選択${selectedInDirect.length}名を割当` : '直属メンバー全員を割当'}
          >
            {someSelected ? `${selectedInDirect.length}名→` : '→ 割当'}
          </button>
        )}
      </div>

      {/* ── 展開時: 直属メンバー + 子ノード ─────────────────── */}
      {expanded && (
        <>
          {directRows.map(row => {
            const name       = personName(row, personBySfId)
            const isSelected = selectedRowIds.has(row.rowId)
            // 選択中ならグローバル選択全員をドラッグ、未選択なら自分だけ
            const dragIds    = isSelected ? [...selectedRowIds] : [row.rowId]
            const dragLabel  = isSelected && dragIds.length > 1
              ? `${dragIds.length}名`
              : name
            return (
              <div
                key={row.rowId}
                style={{ paddingLeft: `${(depth + 1) * 10}px` }}
                draggable
                onDragStart={e => setDragData(e, dragIds, dragLabel)}
                className={`flex items-center gap-1 px-0.5 py-px rounded cursor-grab active:cursor-grabbing ${
                  isSelected ? 'bg-orange-100' : 'hover:bg-orange-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleRow(row.rowId)}
                  className="flex-shrink-0 w-3 h-3 accent-orange-500 cursor-pointer"
                  onMouseDown={e => e.stopPropagation()}
                />
                <span className="text-xs text-gray-600 truncate flex-1">{name}</span>
              </div>
            )
          })}

          {children.map(child => (
            <OrgTreeNode
              key={child.orgId}
              node={child}
              depth={depth + 1}
              selectedRowIds={selectedRowIds}
              personBySfId={personBySfId}
              onToggleRow={onToggleRow}
              onToggleAll={onToggleAll}
              onAssign={onAssign}
            />
          ))}
        </>
      )}
    </div>
  )
}
