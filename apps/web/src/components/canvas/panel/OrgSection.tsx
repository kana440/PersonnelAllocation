import { useState } from 'react'
import { useOrgView } from '../OrgViewContext'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { subtreeRowCount, hasAnyRows } from './helpers'
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
  const { organizations, positionTreeByOrgId } = useOrgView()
  const showVacantPositions = useCanvasLayoutStore(s => s.showVacantPositions)
  const [open, setOpen] = useState(true)

  const allEntries = positionTreeByOrgId.get(orgId) ?? []
  const entries    = showVacantPositions
    ? allEntries
    : allEntries.filter(e => !e.row.positionCode || !!e.row.userId)
  const hasRowsFn  = (id: string) => positionTreeByOrgId.has(id)
  const childOrgs  = organizations.filter(
    o => o.parentId === orgId && hasAnyRows(o.id, organizations, hasRowsFn),
  )
  const org        = organizations.find(o => o.id === orgId)
  const totalCount = subtreeRowCount(orgId, organizations, id => positionTreeByOrgId.get(id)?.length ?? 0)

  if (allEntries.length === 0 && childOrgs.length === 0) return null

  return (
    <div>
      {!isRoot && org && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
        >
          <span className="text-gray-400">{open ? '▼' : '▶'}</span>
          <span className="flex-1 truncate text-left">{org.name}</span>
          <span className="text-gray-400 flex-shrink-0">({totalCount}名)</span>
        </button>
      )}

      {(isRoot || open) && (
        <div className={!isRoot ? 'pl-2 border-l border-gray-100 ml-1' : undefined}>
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
