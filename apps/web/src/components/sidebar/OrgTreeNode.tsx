import React, { createContext, useContext } from 'react'
import { rowDiff } from '@personnel/domain/allocationRow'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'

interface OrgNodeCtx {
  viewOrgs:             Organization[]
  afterMembersByOrgId:  Map<string, Array<{ row: AllocationRow; person: Person | null }>>
  subtreeCountByOrgId:  Map<string, number>
  beforeOrgs:           Organization[]
  expandedOrgIds:       Set<string>
  selectedCardRowId:    number | null
  showVacantPositions:  boolean
  toggleOrg:            (id: string) => void
  onOrgClick:           (orgId: string) => void
  onPersonClick:        (rowId: number, orgId: string) => void
  onPersonDoubleClick:  (personId: string) => void
  onPersonContextMenu:  (e: React.MouseEvent, personId: string) => void
  onPersonDragStart:    (e: React.DragEvent, personId: string, orgId: string) => void
}

const OrgNodeCtx = createContext<OrgNodeCtx>(null!)
export const OrgNodeProvider = OrgNodeCtx.Provider

export function OrgTreeNode({ org, depth }: { org: Organization; depth: number }) {
  const {
    viewOrgs, afterMembersByOrgId, subtreeCountByOrgId,
    expandedOrgIds, selectedCardRowId, showVacantPositions, toggleOrg, onOrgClick, onPersonClick,
    onPersonDoubleClick, onPersonContextMenu, onPersonDragStart,
  } = useContext(OrgNodeCtx)

  const children     = viewOrgs.filter(o => o.parentId === org.id)
  const directPeople = afterMembersByOrgId.get(org.id) ?? []
  const isExpanded   = expandedOrgIds.has(org.id)
  const hasContent   = children.length > 0 || directPeople.length > 0
  const totalCount   = subtreeCountByOrgId.get(org.id) ?? 0
  const indent       = Math.min(depth * 8, 40)
  const personIndent = Math.min(depth * 8 + 14, 54)

  return (
    <div>
      <div
        data-org-id={org.id}
        style={{ paddingLeft: indent }}
        className="flex items-center gap-0.5 rounded py-0.5 px-1 transition-colors hover:bg-gray-50"
      >
        <button
          onClick={() => hasContent && toggleOrg(org.id)}
          className="w-3.5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-[10px]"
        >
          {hasContent ? (isExpanded ? '▾' : '▸') : <span className="w-3.5" />}
        </button>
        <button
          onClick={() => onOrgClick(org.id)}
          onDoubleClick={() => hasContent && toggleOrg(org.id)}
          className="flex-1 text-left text-xs py-0.5 truncate font-medium text-gray-700 hover:text-blue-600"
        >
          {org.name}
        </button>
        {totalCount > 0 && <span className="text-[10px] text-gray-400 flex-shrink-0">{totalCount}</span>}
      </div>

      {isExpanded && (
        <>
          {directPeople.map(({ row, person }) => {
            // ── 空席ポジション ────────────────────────────────────────────
            if (!person) {
              if (!showVacantPositions) return null
              const isSelected = selectedCardRowId === row.rowId
              const posLabel   = row.positionCode?.startsWith('_pos_') ? '' : (row.positionCode ?? '')
              return (
                <div
                  key={row.rowId}
                  data-sidebar-rowid={row.rowId}
                  style={{ paddingLeft: personIndent }}
                  className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer ${
                    isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onPersonClick(row.rowId, org.id)}
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

            // ── 在席者 ────────────────────────────────────────────────────
            const isPersonSelected  = selectedCardRowId === row.rowId
            const isConcurrent      = row.concurrentType === '兼務'
            const subtitle          = row.localJobTitle || row.officialPositionCode || ''
            const hasTransferIssue  = rowDiff(row).length > 0 && !row.transferReason
            const hasPositionChange = row.officialPositionCode !== row.prevOfficialPositionCode
            return (
              <div
                key={row.rowId}
                data-sidebar-rowid={row.rowId}
                draggable
                style={{ paddingLeft: personIndent }}
                className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-grab active:cursor-grabbing ${
                  isPersonSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => onPersonClick(row.rowId, org.id)}
                onDoubleClick={() => onPersonDoubleClick(person.id)}
                onContextMenu={e => onPersonContextMenu(e, person.id)}
                onDragStart={e => onPersonDragStart(e, person.id, org.id)}
              >
                <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
                  {isConcurrent ? '兼' : '—'}
                </span>
                <span className={`text-xs flex-1 truncate ${
                  isPersonSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'
                }`}>
                  {person.name}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{subtitle}</span>
                {hasPositionChange && <span className="text-[10px] text-blue-400 flex-shrink-0" title="役職変更あり">↑</span>}
                {hasTransferIssue  && <span className="text-[10px] text-orange-500 font-bold flex-shrink-0" title="異動事由未入力">!</span>}
                {isPersonSelected  && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
              </div>
            )
          })}
          {children.map(c => <OrgTreeNode key={c.id} org={c} depth={depth + 1} />)}
        </>
      )}
    </div>
  )
}
