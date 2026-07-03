import { useMemo, useState, useCallback } from 'react'
import { useStore }             from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useCanvasDisplayStore } from '../../../store/canvasDisplayStore'
import { useOrgView }           from '../OrgViewContext'
import type { DragData }        from '../OrgViewContext'
import { NameChip }             from './NameChip'
import type { PositionEntry }   from '../OrgViewContext'
import { promotionDef, demotionDef } from '@personnel/domain/commands/defs/promotionDefs'
import { COMPACT_GROUP_DEFS, DEFAULT_COMPACT_GROUP_ID } from './compactGroupDefs'

interface Props {
  orgId:   string
  panelId: string
}

export function BandMatrixPanel({ orgId, panelId }: Props) {
  const masters             = useStore(s => s.masters)
  const allocationList      = useStore(s => s.allocationList)
  const showVacantPositions = useCanvasLayoutStore(s => s.showVacantPositions)
  const { compactGroupById }         = useCanvasDisplayStore()
  const { positionTreeByOrgId, openBandDrop, isHistoryPreviewMode } = useOrgView()

  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const entries = positionTreeByOrgId.get(orgId) ?? []

  const groupDef = COMPACT_GROUP_DEFS.find(d => d.id === compactGroupById)
    ?? COMPACT_GROUP_DEFS.find(d => d.id === DEFAULT_COMPACT_GROUP_ID)!

  const isBandGrouping = groupDef.id === 'positionBand'

  const levelOf = useCallback(
    (band: string) => masters.jobLevels.find(e => e.label === band)?.promotionDemotionWarningLevel ?? -1,
    [masters.jobLevels],
  )

  const groups = useMemo(() => {
    const visible = showVacantPositions
      ? entries
      : entries.filter((e: PositionEntry) => !!e.row.userId)

    const map = new Map<string, PositionEntry[]>()
    for (const entry of visible) {
      const key = groupDef.getKey(entry.row)
      const arr = map.get(key)
      if (arr) arr.push(entry)
      else map.set(key, [entry])
    }

    const sortedKeys = groupDef.sortKeys([...map.keys()], masters)
    return sortedKeys.map(key => ({ key, items: map.get(key)! }))
  }, [entries, groupDef, masters, showVacantPositions])

  const handleGroupDrop = useCallback((e: React.DragEvent, toKey: string) => {
    e.preventDefault()
    setDragOverKey(null)
    if (!isBandGrouping || isHistoryPreviewMode) return

    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }

    if (data.dragType !== 'person' || !data.rowId || data.fromOrgId !== orgId) return
    e.stopPropagation()

    const row = allocationList.find(r => r.rowId === data.rowId)
    if (!row || !row.userId) return

    const fromBand = row.positionBand as string | undefined
    if (!fromBand || fromBand === toKey) return

    const fromLevel = levelOf(fromBand)
    const toLevel   = levelOf(toKey)
    if (fromLevel === toLevel) return

    const def = toLevel > fromLevel ? promotionDef : demotionDef
    openBandDrop({ def, row, overrideInitial: { positionBand: toKey } })
  }, [allocationList, isBandGrouping, isHistoryPreviewMode, levelOf, openBandDrop, orgId])

  if (groups.length === 0) return null

  return (
    <div className="p-1.5 space-y-1.5">
      {groups.map(({ key, items }) => (
        <div
          key={key}
          onDragOver={isBandGrouping ? e => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDragOverKey(key)
          } : undefined}
          onDragLeave={isBandGrouping ? e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null)
          } : undefined}
          onDrop={isBandGrouping ? e => handleGroupDrop(e, key) : undefined}
          className={`rounded transition-colors ${dragOverKey === key ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
        >
          <div className={`text-[9px] font-semibold tracking-wider mb-0.5 px-0.5 leading-none transition-colors ${
            dragOverKey === key ? 'text-blue-500' : 'text-gray-400'
          }`}>
            {key}
            {dragOverKey === key && (
              <span className="ml-1 text-[8px] font-normal text-blue-400">← ここにドロップ</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 px-0.5 pb-0.5">
            {items.map((entry: PositionEntry) => (
              <NameChip key={entry.row.rowId} entry={entry} orgId={orgId} panelId={panelId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
