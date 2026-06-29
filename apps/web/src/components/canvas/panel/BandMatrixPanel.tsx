import { useMemo, useState, useCallback } from 'react'
import { useStore }             from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useOrgView }           from '../OrgViewContext'
import type { DragData }        from '../OrgViewContext'
import { NameChip }             from './NameChip'
import type { PositionEntry }   from '../OrgViewContext'
import { promotionDef, demotionDef } from '@personnel/domain/commands/defs/promotionDefs'

interface Props {
  orgId:   string
  panelId: string
}

export function BandMatrixPanel({ orgId, panelId }: Props) {
  const { masters, allocationList }  = useStore()
  const { showVacantPositions }      = useCanvasLayoutStore()
  const { positionTreeByOrgId, openBandDrop, isHistoryPreviewMode } = useOrgView()

  const [dragOverBand, setDragOverBand] = useState<string | null>(null)

  const entries = positionTreeByOrgId.get(orgId) ?? []

  const levelOf = useCallback(
    (band: string) => masters.jobLevels.find(e => e.label === band)?.promotionDemotionWarningLevel ?? -1,
    [masters.jobLevels],
  )

  const bandGroups = useMemo(() => {
    const visible = showVacantPositions
      ? entries
      : entries.filter((e: PositionEntry) => !!e.row.userId)

    const groups = new Map<string, PositionEntry[]>()
    for (const entry of visible) {
      const band = (entry.row.positionBand as string | undefined) ?? '(未設定)'
      const arr  = groups.get(band)
      if (arr) arr.push(entry)
      else groups.set(band, [entry])
    }

    return [...groups.entries()]
      .sort(([bandA], [bandB]) => levelOf(bandB) - levelOf(bandA))
      .map(([band, items]) => ({ band, items }))
  }, [entries, levelOf, showVacantPositions])

  const handleBandDrop = useCallback((e: React.DragEvent, toBand: string) => {
    e.preventDefault()
    setDragOverBand(null)
    if (isHistoryPreviewMode) return

    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }

    // 同一組織・person ドラッグのみ対象（異組織は OrgPanel の handleDrop に委譲）
    if (data.dragType !== 'person' || !data.rowId || data.fromOrgId !== orgId) return
    e.stopPropagation()

    const row = allocationList.find(r => r.rowId === data.rowId)
    if (!row || !row.userId) return

    const fromBand = row.positionBand as string | undefined
    if (!fromBand || fromBand === toBand) return

    const fromLevel = levelOf(fromBand)
    const toLevel   = levelOf(toBand)
    if (fromLevel === toLevel) return  // 同レベルは無視（M/P切替等は別操作）

    const def = toLevel > fromLevel ? promotionDef : demotionDef
    openBandDrop({ def, row, overrideInitial: { positionBand: toBand } })
  }, [allocationList, isHistoryPreviewMode, levelOf, openBandDrop, orgId])

  if (bandGroups.length === 0) return null

  return (
    <div className="p-1.5 space-y-1.5">
      {bandGroups.map(({ band, items }) => (
        <div
          key={band}
          onDragOver={e => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDragOverBand(band)
          }}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverBand(null)
          }}
          onDrop={e => handleBandDrop(e, band)}
          className={`rounded transition-colors ${dragOverBand === band ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
        >
          <div className={`text-[9px] font-semibold tracking-wider mb-0.5 px-0.5 leading-none transition-colors ${
            dragOverBand === band ? 'text-blue-500' : 'text-gray-400'
          }`}>
            {band}
            {dragOverBand === band && (
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
