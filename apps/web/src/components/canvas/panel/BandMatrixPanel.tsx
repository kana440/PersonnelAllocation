import { useMemo } from 'react'
import { useStore }            from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useOrgView }          from '../OrgViewContext'
import { NameChip }            from './NameChip'
import type { PositionEntry }  from '../OrgViewContext'

interface Props {
  orgId:   string
  panelId: string
}

export function BandMatrixPanel({ orgId, panelId }: Props) {
  const { masters }            = useStore()
  const { showVacantPositions } = useCanvasLayoutStore()
  const { positionTreeByOrgId } = useOrgView()

  const entries = positionTreeByOrgId.get(orgId) ?? []

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
      .sort(([bandA], [bandB]) => {
        const lvA = masters.jobLevels.find(e => e.label === bandA)?.promotionDemotionWarningLevel ?? -1
        const lvB = masters.jobLevels.find(e => e.label === bandB)?.promotionDemotionWarningLevel ?? -1
        return lvB - lvA
      })
      .map(([band, items]) => ({ band, items }))
  }, [entries, masters.jobLevels, showVacantPositions])

  if (bandGroups.length === 0) return null

  return (
    <div className="p-1.5 space-y-1.5">
      {bandGroups.map(({ band, items }) => (
        <div key={band}>
          <div className="text-[9px] font-semibold text-gray-400 tracking-wider mb-0.5 px-0.5 leading-none">
            {band}
          </div>
          <div className="flex flex-wrap gap-1">
            {items.map((entry: PositionEntry) => (
              <NameChip key={entry.row.rowId} entry={entry} orgId={orgId} panelId={panelId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
