import { useStore }   from '../../../store/useStore'
import { useOrgView } from '../OrgViewContext'
import type { PositionEntry, DragData } from '../OrgViewContext'

interface Props {
  entry:   PositionEntry
  orgId:   string
  panelId: string
}

export function NameChip({ entry, orgId, panelId }: Props) {
  const { isHistoryPreviewMode } = useStore()
  const { setDragOverOrgId, isSelectMode, handlePersonClick, handleRowDoubleClick } = useOrgView()

  const { row, person } = entry
  const isVacant     = !row.userId
  const isConcurrent = (row.concurrentType as string | undefined) === '兼務'
  const name         = isVacant
    ? '空席'
    : [row.lastName, row.firstName].filter(Boolean).join(' ')

  const draggable = !isHistoryPreviewMode

  const chipClass = isVacant
    ? 'border-gray-300 bg-gray-50 text-gray-400 border-dashed italic'
    : isConcurrent
      ? 'border-purple-400 bg-purple-50 text-gray-700'
      : 'border-blue-400 bg-white text-gray-800 hover:bg-blue-50'

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? e => {
        if (isVacant) {
          const data: DragData = {
            dragType: 'position', fromOrgId: orgId, fromCompanyId: '',
            affiliationType: 'primary',
            fromRowId: row.rowId, rowId: row.rowId, fromPanelId: panelId,
          }
          e.dataTransfer.setData('application/json', JSON.stringify(data))
          e.dataTransfer.setData('application/x-position-drag', '')
        } else {
          const data: DragData = {
            dragType: 'person', personId: person!.id,
            fromOrgId: orgId, fromCompanyId: '',
            affiliationType: isConcurrent ? 'concurrent' : 'primary',
            source: 'after', fromRowId: row.rowId, rowId: row.rowId, fromPanelId: panelId,
          }
          e.dataTransfer.setData('application/json', JSON.stringify(data))
        }
        e.dataTransfer.effectAllowed = 'move'
      } : undefined}
      onDragEnd={() => setDragOverOrgId(null)}
      data-rowid={row.rowId}
      onClick={e => {
        if (isVacant || isHistoryPreviewMode) return
        handlePersonClick(person!.id, panelId, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }, row.rowId)
      }}
      onDoubleClick={e => {
        if (!isSelectMode && !isHistoryPreviewMode) handleRowDoubleClick(e, row.rowId)
      }}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border-l-2 cursor-pointer select-none transition-colors ${chipClass}`}
    >
      {name}
    </div>
  )
}
