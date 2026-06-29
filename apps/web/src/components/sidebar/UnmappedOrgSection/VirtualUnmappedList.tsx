import { useRef, useMemo, useCallback }  from 'react'
import { useVirtualizer }                from '@tanstack/react-virtual'
import type { AllocationRow }            from '@personnel/domain/allocationRow'
import type { Person }                   from '@personnel/domain/schemas'
import type { TreeNode }                 from './OrgTreeNode'
import { flattenUnmappedTree }           from './flattenUnmappedTree'
import type { FlatUnmappedRow }          from './flattenUnmappedTree'

const ORPHAN_ORG_ID = '__orphan__'
const MAX_HEIGHT     = 256  // px (≒ max-h-64)

interface Props {
  treeRoots:      TreeNode[]
  orphanRows:     AllocationRow[]
  expandedOrgIds: Set<string>
  selectedRowIds: Set<number>
  personBySfId:   Map<string, Person>
  onToggleExpand: (orgId: string) => void
  onToggleRow:    (rowId: number) => void
  onToggleAll:    (rowIds: number[], select: boolean) => void
  onAssign:       (rowIds: number[], label: string, orgName: string) => void
}

export function VirtualUnmappedList({
  treeRoots, orphanRows, expandedOrgIds, selectedRowIds,
  personBySfId, onToggleExpand, onToggleRow, onToggleAll, onAssign,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const orphanNode: TreeNode | null = orphanRows.length > 0 ? {
    orgId:         ORPHAN_ORG_ID,
    orgName:       'その他',
    directRows:    orphanRows,
    subtreeRowIds: orphanRows.map(r => r.rowId),
    subtreeCount:  orphanRows.length,
    children:      [],
  } : null

  const allRoots = useMemo(
    () => (orphanNode ? [...treeRoots, orphanNode] : treeRoots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeRoots, orphanRows],
  )

  const flatRows = useMemo(
    () => flattenUnmappedTree(allRoots, expandedOrgIds, personBySfId),
    [allRoots, expandedOrgIds, personBySfId],
  )

  const virtualizer = useVirtualizer({
    count:            flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     (i) => flatRows[i].kind === 'org' ? 24 : 20,
    overscan:         8,
    getItemKey:       (i) => {
      const r = flatRows[i]
      return r.kind === 'org' ? `o-${r.orgId}` : `p-${r.row.rowId}`
    },
  })

  const setDragData = useCallback((e: React.DragEvent, rowIds: number[], label: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-unmapped-bulk', '1')
    e.dataTransfer.setData('application/json', JSON.stringify({
      rowIds, prevOrgName: label, fromOrgId: '', fromCompanyId: '', affiliationType: 'primary',
    }))
  }, [])

  if (flatRows.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto"
      style={{ maxHeight: Math.min(virtualizer.getTotalSize(), MAX_HEIGHT) }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const row = flatRows[vItem.index]
          return (
            <div
              key={vItem.key}
              style={{
                position:  'absolute',
                top:       0,
                left:      0,
                width:     '100%',
                height:    `${vItem.size}px`,
                transform: `translateY(${vItem.start}px)`,
                overflow:  'hidden',
              }}
            >
              {row.kind === 'org' && (
                <OrgRow
                  row={row}
                  selectedRowIds={selectedRowIds}
                  onToggleExpand={() => onToggleExpand(row.orgId)}
                  onToggleAll={onToggleAll}
                  onAssign={onAssign}
                  onDragStart={setDragData}
                />
              )}
              {row.kind === 'person' && (
                <PersonRow
                  row={row}
                  selectedRowIds={selectedRowIds}
                  onToggleRow={onToggleRow}
                  onDragStart={(e) => {
                    const isSelected = selectedRowIds.has(row.row.rowId)
                    const dragIds    = isSelected ? [...selectedRowIds] : [row.row.rowId]
                    const dragLabel  = isSelected && dragIds.length > 1 ? `${dragIds.length}名` : row.name
                    setDragData(e, dragIds, dragLabel)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── OrgRow ──────────────────────────────────────────────────────────────────

function OrgRow({ row, selectedRowIds, onToggleExpand, onToggleAll, onAssign, onDragStart }: {
  row:            Extract<FlatUnmappedRow, { kind: 'org' }>
  selectedRowIds: Set<number>
  onToggleExpand: () => void
  onToggleAll:    (rowIds: number[], select: boolean) => void
  onAssign:       (rowIds: number[], label: string, orgName: string) => void
  onDragStart:    (e: React.DragEvent, rowIds: number[], label: string) => void
}) {
  const { orgId: _orgId, orgName, expanded, hasDirectMembers, subtreeCount, directRowIds } = row
  const indent = row.depth * 10

  const selectedInDirect  = directRowIds.filter(id => selectedRowIds.has(id))
  const allDirectSelected = selectedInDirect.length === directRowIds.length && directRowIds.length > 0
  const someSelected      = selectedInDirect.length > 0

  const assignIds   = someSelected ? selectedInDirect : directRowIds
  const assignLabel = someSelected ? `${selectedInDirect.length}名 (${orgName})` : orgName

  return (
    <div className="flex items-center gap-0.5" style={{ paddingLeft: indent }}>
      {hasDirectMembers ? (
        <input
          type="checkbox"
          checked={allDirectSelected}
          onChange={e => onToggleAll(directRowIds, e.target.checked)}
          className="flex-shrink-0 w-3 h-3 accent-orange-500 cursor-pointer"
          title="直属メンバー全選択"
        />
      ) : (
        <span className="flex-shrink-0 w-3" />
      )}

      <button
        draggable={hasDirectMembers}
        onDragStart={hasDirectMembers ? (e => onDragStart(e, directRowIds, orgName)) : undefined}
        onClick={onToggleExpand}
        className={`flex-1 flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-orange-50 text-xs transition-colors min-w-0 ${
          hasDirectMembers
            ? 'text-gray-700 cursor-grab active:cursor-grabbing'
            : 'text-gray-500 cursor-pointer'
        }`}
      >
        <span className="text-gray-400 flex-shrink-0 text-[10px]">
          {(subtreeCount > 0 || hasDirectMembers) ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="truncate flex-1">{orgName}</span>
        <span className="text-gray-400 flex-shrink-0 text-[10px] text-right">
          {someSelected && <span className="text-orange-500">{selectedInDirect.length}/</span>}
          {subtreeCount}名
        </span>
      </button>

      {hasDirectMembers && (
        <button
          onClick={() => onAssign(assignIds, assignLabel, orgName)}
          className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors whitespace-nowrap"
          title={someSelected ? `選択${selectedInDirect.length}名を割当` : '直属メンバー全員を割当'}
        >
          {someSelected ? `${selectedInDirect.length}名→` : '→ 割当'}
        </button>
      )}
    </div>
  )
}

// ── PersonRow ────────────────────────────────────────────────────────────────

function PersonRow({ row, selectedRowIds, onToggleRow, onDragStart }: {
  row:            Extract<FlatUnmappedRow, { kind: 'person' }>
  selectedRowIds: Set<number>
  onToggleRow:    (rowId: number) => void
  onDragStart:    (e: React.DragEvent) => void
}) {
  const indent     = row.depth * 10
  const isSelected = selectedRowIds.has(row.row.rowId)

  return (
    <div
      style={{ paddingLeft: indent }}
      draggable
      onDragStart={onDragStart}
      className={`flex items-center gap-1 px-0.5 py-px rounded cursor-grab active:cursor-grabbing ${
        isSelected ? 'bg-orange-100' : 'hover:bg-orange-50'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleRow(row.row.rowId)}
        className="flex-shrink-0 w-3 h-3 accent-orange-500 cursor-pointer"
        onMouseDown={e => e.stopPropagation()}
      />
      <span className="text-xs text-gray-600 truncate flex-1">{row.name}</span>
    </div>
  )
}
