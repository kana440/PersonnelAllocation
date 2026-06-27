import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { rowDiff } from '@personnel/domain/allocationRow'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'
import { flattenOrgTree } from './flattenOrgTree'

export interface VirtualOrgTreeHandle {
  scrollToRowId: (rowId: number) => void
}

export interface VirtualOrgTreeProps {
  viewOrgs:            Organization[]
  membersByOrgId:      Map<string, Array<{ row: AllocationRow; person: Person | null }>>
  subtreeCountByOrgId: Map<string, number>
  showVacantPositions: boolean
  expandedOrgIds:      Set<string>
  closedCompanies:     Set<string>
  selectedCardRowId:   number | null
  toggleCompany:       (id: string) => void
  toggleOrg:           (id: string) => void
  onOrgClick:          (orgId: string) => void
  onPersonClick:       (rowId: number, orgId: string) => void
  onPersonDoubleClick: (personId: string) => void
  onPersonContextMenu: (e: React.MouseEvent, personId: string) => void
  onPersonDragStart:   (e: React.DragEvent, personId: string, orgId: string) => void
  className?:          string
  footer?:             React.ReactNode
}

export const VirtualOrgTree = forwardRef<VirtualOrgTreeHandle, VirtualOrgTreeProps>(
  function VirtualOrgTree(props, ref) {
    const {
      viewOrgs, membersByOrgId, subtreeCountByOrgId, showVacantPositions,
      expandedOrgIds, closedCompanies, selectedCardRowId,
      toggleCompany, toggleOrg, onOrgClick, onPersonClick,
      onPersonDoubleClick, onPersonContextMenu, onPersonDragStart,
      className = '', footer,
    } = props

    const scrollRef = useRef<HTMLDivElement>(null)

    const flatRows = useMemo(
      () => flattenOrgTree({ viewOrgs, expandedOrgIds, closedCompanies, membersByOrgId, subtreeCountByOrgId, showVacantPositions }),
      [viewOrgs, expandedOrgIds, closedCompanies, membersByOrgId, subtreeCountByOrgId, showVacantPositions],
    )

    const virtualizer = useVirtualizer({
      count:            flatRows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize:     (i) => flatRows[i].kind === 'company' ? 32 : 22,
      getItemKey:       (i) => {
        const r = flatRows[i]
        if (r.kind === 'company') return `c-${r.companyId}`
        if (r.kind === 'org')     return `o-${r.org.id}`
        return `p-${r.row.rowId}`
      },
      overscan: 8,
    })

    useImperativeHandle(ref, () => ({
      scrollToRowId: (rowId: number) => {
        const idx = flatRows.findIndex(r => r.kind === 'person' && r.row.rowId === rowId)
        if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
      },
    }))

    return (
      <div ref={scrollRef} className={`overflow-y-auto min-h-0 ${className}`}>
        {/* 仮想リスト本体 */}
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
                  height:    `${vItem.size}px`,  // 推定値と実DOMを一致させて累積誤差をゼロにする
                  transform: `translateY(${vItem.start}px)`,
                  overflow:  'hidden',
                }}
              >
                {row.kind === 'company' && (
                  <CompanyRow
                    companyId={row.companyId}
                    isOpen={row.isOpen}
                    onToggle={() => toggleCompany(row.companyId)}
                  />
                )}
                {row.kind === 'org' && (
                  <OrgRow
                    org={row.org}
                    depth={row.depth}
                    hasChildren={row.hasChildren}
                    isExpanded={row.isExpanded}
                    subtreeCount={row.subtreeCount}
                    onToggle={() => toggleOrg(row.org.id)}
                    onOrgClick={() => onOrgClick(row.org.id)}
                  />
                )}
                {row.kind === 'person' && row.person === null && (
                  <VacantRow
                    row={row.row}
                    depth={row.depth}
                    isSelected={selectedCardRowId === row.row.rowId}
                    onClick={() => onPersonClick(row.row.rowId, row.orgId)}
                  />
                )}
                {row.kind === 'person' && row.person !== null && (
                  <PersonRow
                    row={row.row}
                    person={row.person}
                    orgId={row.orgId}
                    depth={row.depth}
                    isSelected={selectedCardRowId === row.row.rowId}
                    onPersonClick={onPersonClick}
                    onPersonDoubleClick={onPersonDoubleClick}
                    onPersonContextMenu={onPersonContextMenu}
                    onPersonDragStart={onPersonDragStart}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* ツリー下部の追加コンテンツ（UnmappedOrgSection・所属なし・凡例など） */}
        {footer}
      </div>
    )
  }
)

// ── 行コンポーネント ────────────────────────────────────────────────────────────

function CompanyRow({ companyId, isOpen, onToggle }: {
  companyId: string; isOpen: boolean; onToggle: () => void
}) {
  return (
    <div className="pt-1 px-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded border border-gray-200 transition-colors"
      >
        <span className="truncate">{companyId}</span>
        <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
      </button>
    </div>
  )
}

function OrgRow({ org, depth, hasChildren, isExpanded, subtreeCount, onToggle, onOrgClick }: {
  org: Organization; depth: number; hasChildren: boolean; isExpanded: boolean
  subtreeCount: number; onToggle: () => void; onOrgClick: () => void
}) {
  const indent = Math.min(depth * 8, 40)
  return (
    <div
      data-org-id={org.id}
      style={{ paddingLeft: indent }}
      className="flex items-center gap-0.5 rounded py-0.5 px-1 hover:bg-gray-50"
    >
      <button
        onClick={() => hasChildren && onToggle()}
        className="w-3.5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-[10px]"
      >
        {hasChildren ? (isExpanded ? '▾' : '▸') : <span className="w-3.5" />}
      </button>
      <button
        onClick={onOrgClick}
        onDoubleClick={() => hasChildren && onToggle()}
        className="flex-1 text-left text-xs py-0.5 truncate font-medium text-gray-700 hover:text-blue-600"
      >
        {org.name}
      </button>
      {subtreeCount > 0 && (
        <span className="text-[10px] text-gray-400 flex-shrink-0">{subtreeCount}</span>
      )}
    </div>
  )
}

function VacantRow({ row, depth, isSelected, onClick }: {
  row: AllocationRow; depth: number; isSelected: boolean; onClick: () => void
}) {
  const indent   = Math.min(depth * 8 + 14, 54)
  const posLabel = row.positionCode?.startsWith('_pos_') ? '' : (row.positionCode ?? '')
  return (
    <div
      data-sidebar-rowid={row.rowId}
      style={{ paddingLeft: indent }}
      className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer ${isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
      onClick={onClick}
    >
      <span className="text-[10px] text-gray-300 flex-shrink-0">□</span>
      <span className={`text-xs flex-1 truncate italic ${isSelected ? 'font-semibold text-gray-500' : 'text-gray-400'}`}>
        空席
      </span>
      {posLabel && <span className="text-[10px] text-gray-300 flex-shrink-0 truncate max-w-[60px]">{posLabel}</span>}
      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
    </div>
  )
}

function PersonRow({ row, person, orgId, depth, isSelected, onPersonClick, onPersonDoubleClick, onPersonContextMenu, onPersonDragStart }: {
  row: AllocationRow; person: Person; orgId: string; depth: number; isSelected: boolean
  onPersonClick:       (rowId: number, orgId: string) => void
  onPersonDoubleClick: (personId: string) => void
  onPersonContextMenu: (e: React.MouseEvent, personId: string) => void
  onPersonDragStart:   (e: React.DragEvent, personId: string, orgId: string) => void
}) {
  const indent           = Math.min(depth * 8 + 14, 54)
  const isConcurrent     = row.concurrentType === '兼務'
  const subtitle         = row.localJobTitle || row.officialPositionCode || ''
  const hasTransferIssue = rowDiff(row).length > 0 && !row.transferReason
  const hasPositionChange = row.officialPositionCode !== row.prevOfficialPositionCode
  return (
    <div
      data-sidebar-rowid={row.rowId}
      draggable
      style={{ paddingLeft: indent }}
      className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-grab active:cursor-grabbing ${isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
      onClick={() => onPersonClick(row.rowId, orgId)}
      onDoubleClick={() => onPersonDoubleClick(person.id)}
      onContextMenu={e => onPersonContextMenu(e, person.id)}
      onDragStart={e => onPersonDragStart(e, person.id, orgId)}
    >
      <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
        {isConcurrent ? '兼' : '—'}
      </span>
      <span className={`text-xs flex-1 truncate ${isSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'}`}>
        {person.name}
      </span>
      <span className="text-xs text-gray-400 flex-shrink-0">{subtitle}</span>
      {hasPositionChange && <span className="text-[10px] text-blue-400 flex-shrink-0" title="役職変更あり">↑</span>}
      {hasTransferIssue  && <span className="text-[10px] text-orange-500 font-bold flex-shrink-0" title="異動事由未入力">!</span>}
      {isSelected        && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
    </div>
  )
}
