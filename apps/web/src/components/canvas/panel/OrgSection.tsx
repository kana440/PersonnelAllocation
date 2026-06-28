import { useState } from 'react'
import { useOrgView } from '../OrgViewContext'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { subtreeRowCount } from './helpers'
import { RowCard } from './RowCard'
import type { PersonStatus } from '../comparison/types'

export interface ComparisonInfo {
  status:  PersonStatus
  orgName: string
}

type RowCardComparisonStatus = 'same' | 'probable-same' | 'other'

function toRowCardStatus(s: PersonStatus): RowCardComparisonStatus {
  return s === 'stayed' ? 'same' : 'other'
}

interface OrgSectionProps {
  orgId:              string
  panelId:            string
  isRoot?:            boolean
  colorIndex:         number
  comparisonByRowId?: Map<number, ComparisonInfo>
}

export function OrgSection({
  orgId,
  panelId,
  isRoot,
  colorIndex,
  comparisonByRowId,
}: OrgSectionProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, setDragOverOrgId, handleDrop,
  } = useOrgView()
  const showVacantPositions = useCanvasLayoutStore(s => s.showVacantPositions)
  const [open, setOpen] = useState(true)

  const allEntries = positionTreeByOrgId.get(orgId) ?? []
  const entries    = showVacantPositions
    ? allEntries
    : allEntries.filter(e => !e.row.positionCode || !!e.row.userId)
  // 行がなくても子組織は表示する（空のままドロップ先として使えるように）
  const childOrgs  = organizations.filter(o => o.parentId === orgId)
  const org        = organizations.find(o => o.id === orgId)
  const totalCount = subtreeRowCount(orgId, organizations, id => positionTreeByOrgId.get(id)?.length ?? 0)

  if (allEntries.length === 0 && childOrgs.length === 0) return null

  const isDropTarget = !isRoot && dragOverOrgId === orgId

  return (
    <div>
      {!isRoot && org && (
        <button
          onClick={() => setOpen(v => !v)}
          onDragOver={e => {
            if (!e.dataTransfer.types.includes('application/json')) return
            e.preventDefault(); e.stopPropagation()
            setDragOverOrgId(orgId)
          }}
          onDragLeave={e => {
            if (!(e.currentTarget as Element).contains(e.relatedTarget as Node))
              setDragOverOrgId(null)
          }}
          onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
          className={`w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-medium rounded transition-colors ${
            isDropTarget
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <span className="text-gray-400">{open ? '▼' : '▶'}</span>
          <span className="flex-1 truncate text-left">{org.name}</span>
          <span className="text-gray-400 flex-shrink-0">({totalCount}名)</span>
        </button>
      )}

      {(isRoot || open) && (
        <div className={!isRoot ? 'pl-2 border-l border-gray-100 ml-1' : undefined}>
          {!isRoot && entries.length === 0 && childOrgs.length === 0 && (
            <p className="text-[10px] text-gray-300 text-center py-1.5">（メンバーなし）</p>
          )}
          {entries.map(entry => {
            const comp = comparisonByRowId?.get(entry.row.rowId)
            return (
              <RowCard
                key={entry.row.rowId}
                entry={entry}
                orgId={orgId}
                panelId={panelId}
                colorIndex={colorIndex}
                comparisonStatus={comp ? toRowCardStatus(comp.status) : undefined}
                comparisonOrgName={comp?.orgName}
              />
            )
          })}
          {childOrgs.map(childOrg => (
            <OrgSection
              key={childOrg.id}
              orgId={childOrg.id}
              panelId={panelId}
              isRoot={false}
              colorIndex={colorIndex}
              comparisonByRowId={comparisonByRowId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
