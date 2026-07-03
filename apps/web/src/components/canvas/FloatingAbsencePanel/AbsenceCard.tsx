import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { DragData } from '../OrgViewContext'
import type { AbsenceCategory } from './helpers'

interface Props {
  row:            AllocationRow
  category:       AbsenceCategory
  prevOrgName:    string
  onDragStart:    (e: React.DragEvent, row: AllocationRow) => void
  onDoubleClick?: (rowId: number) => void
}

const BADGE: Record<AbsenceCategory, string> = {
  '退職': 'bg-red-100 text-red-700',
  '移籍': 'bg-orange-100 text-orange-700',
}

export function AbsenceCard({ row, category, prevOrgName, onDragStart, onDoubleClick }: Props) {
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || '—'

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, row)}
      onDoubleClick={() => onDoubleClick?.(row.rowId)}
      className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-50 rounded cursor-grab active:cursor-grabbing select-none"
    >
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${BADGE[category]}`}>
        {category}
      </span>
      <span className="text-xs text-gray-800 font-medium truncate flex-1 min-w-0">{name}</span>
      {prevOrgName && (
        <span className="text-[10px] text-gray-400 truncate flex-shrink-0 max-w-[72px]">← {prevOrgName}</span>
      )}
    </div>
  )
}

export function buildAbsenceDragData(row: AllocationRow): DragData {
  return {
    dragType:        'person',
    personId:        row.userId as string | undefined,
    fromOrgId:       '',
    fromCompanyId:   '',
    affiliationType: 'primary',
    fromRowId:       row.rowId,
    fromAbsence:     true,
  }
}
