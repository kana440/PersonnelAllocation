import type { Person } from '../../domain/schemas'
import type { AllocationRow } from '../../domain/allocationRow'

interface PersonMenuProps {
  x:          number
  y:          number
  personId:   string
  persons:    Person[]
  canvasMode: string
  onEdit:     (id: string) => void
  onReportRoot: (id: string) => void
  onClose:    () => void
}

export function PersonContextMenu({ x, y, personId, persons, canvasMode, onEdit, onReportRoot, onClose }: PersonMenuProps) {
  const person = persons.find(p => p.id === personId)
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36" style={{ left: x, top: y }}>
        {person && (
          <div className="px-3 py-1.5 border-b border-gray-100 text-xs font-semibold text-gray-500 truncate">{person.name}</div>
        )}
        <button
          onClick={() => { onEdit(personId); onClose() }}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
        >
          <span>✏️</span> 編集画面を開く
        </button>
        {canvasMode === 'レポートライン' && (
          <button
            onClick={() => { onReportRoot(personId); onClose() }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
          >
            <span>📍</span> この人を起点に表示
          </button>
        )}
      </div>
    </>
  )
}

interface PositionMenuProps {
  x:               number
  y:               number
  rowId:           number
  persons:         Person[]
  allocationList:  AllocationRow[]
  onEdit:          (rowId: number) => void
  onChangeTitle:   (rowId: number) => void
  onClose:         () => void
}

export function PositionContextMenu({ x, y, rowId, persons, allocationList, onEdit, onChangeTitle, onClose }: PositionMenuProps) {
  const row    = allocationList.find(r => r.rowId === rowId)
  const person = row?.userId ? persons.find(p => p.sfPersonId === row.userId) : null
  const title  = row?.localJobTitle || row?.officialPositionCode || row?.positionCode || '（役職未設定）'

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-40" style={{ left: x, top: y }}>
        <div className="px-3 py-1.5 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-700 truncate">{title}</div>
          <div className="text-[11px] text-gray-400">{person ? person.name : '空席'}</div>
        </div>
        {row && (
          <button
            onClick={() => { onEdit(rowId); onClose() }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
          >
            <span>✏️</span> 編集画面を開く
          </button>
        )}
        {row?.userId && (
          <button
            onClick={() => { onChangeTitle(rowId); onClose() }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
          >
            <span>🏷️</span> 役職変更
          </button>
        )}
      </div>
    </>
  )
}
