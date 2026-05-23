import { useOrgView } from '../OrgViewContext'
import type { DragData } from '../OrgViewContext'
import { appService } from '../../../application/HRApplicationService'

interface PositionRowsProps { orgId: string }

const isInternalPosCode = (s?: string) => !s || s.startsWith('_pos_')

export function PositionRows({ orgId }: PositionRowsProps) {
  const {
    positionTreeByOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDropOnVacantSlot,
    isSelectMode, selectedPersonIds, togglePersonSelection,
    selectedPersonId, selectPerson,
    handlePersonDoubleClick, handlePersonContextMenu,
    setConfirmDialog,
  } = useOrgView()

  const entries = positionTreeByOrgId.get(orgId) ?? []

  const getPositionTitle = (row: import('../../../domain/allocationRow').AllocationRow): string =>
    row.localJobTitle || row.officialPositionCode ||
    (isInternalPosCode(row.positionCode) ? '' : (row.positionCode ?? '')) ||
    '（役職未設定）'

  return (
    <div className="space-y-1 mb-2">
      {entries.map(({ row, person, depth }) => {
        const isVacant     = !person
        const isSelected   = !isVacant && (isSelectMode ? selectedPersonIds.has(person!.id) : selectedPersonId === person!.id)
        const isConcurrent = row.concurrentType === '兼務'

        return (
          <div key={row.rowId} className="flex items-stretch gap-1 group" style={{ paddingLeft: `${depth * 14}px` }}>

            {/* 左枠: ポジション（ドラッグで席ごと移動） */}
            <div
              draggable
              onDragStart={e => {
                const data: DragData = {
                  dragType: 'position',
                  personId: person?.id ?? '',
                  fromOrgId: orgId, fromCompanyId: '',
                  affiliationType: 'primary',
                  fromRowId: row.rowId,
                }
                e.dataTransfer.setData('application/json', JSON.stringify(data))
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="relative flex items-center gap-1 px-2 py-1 rounded-l bg-gray-100 border border-r-0 border-gray-200 text-xs text-gray-600 font-medium flex-shrink-0 cursor-grab active:cursor-grabbing hover:bg-gray-200 transition-colors"
              style={{ minWidth: '72px', maxWidth: '130px' }}
              title="ドラッグで別組織に席ごと移動"
            >
              <span className="text-gray-400 text-[9px] select-none">⠿</span>
              <span className="truncate flex-1">{getPositionTitle(row)}</span>
              {!isSelectMode && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    const label = getPositionTitle(row)
                    setConfirmDialog({
                      message: `「${label}」を削除しますか？${row.userId ? '\n在席中の人は未アサイン状態になります。' : ''}`,
                      onConfirm: () => appService.removePosition(row.rowId),
                    })
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-100 transition-all text-[10px]"
                  title="このポジション（席）を削除"
                  draggable={false}
                >✕</button>
              )}
            </div>

            {/* 右枠: 人 or 空席 */}
            {isVacant ? (
              <div
                className={`flex-1 flex items-center px-2 py-1 rounded-r border-2 border-dashed text-xs transition-colors ${
                  dragOverVacantRowId === row.rowId
                    ? 'border-blue-400 bg-blue-100 text-blue-600'
                    : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-400 hover:bg-blue-50/30'
                }`}
                onDragOver={e => { if (!e.dataTransfer.types.includes('application/json')) return; e.preventDefault(); e.stopPropagation(); setDragOverVacantRowId(row.rowId) }}
                onDragLeave={() => setDragOverVacantRowId(null)}
                onDrop={e => { setDragOverVacantRowId(null); handleDropOnVacantSlot(e, row.rowId) }}
              >
                {dragOverVacantRowId === row.rowId ? 'ここにドロップ' : '（空席）← drop'}
              </div>
            ) : (
              <div
                draggable={!isSelectMode}
                onDragStart={!isSelectMode ? e => {
                  const data: DragData = {
                    dragType: 'person',
                    personId: person!.id, fromOrgId: orgId, fromCompanyId: '',
                    affiliationType: isConcurrent ? 'concurrent' : 'primary',
                    source: 'after', fromRowId: row.rowId,
                  }
                  e.dataTransfer.setData('application/json', JSON.stringify(data))
                  e.dataTransfer.effectAllowed = 'move'
                } : undefined}
                onClick={() => isSelectMode ? togglePersonSelection(person!.id) : selectPerson(person!.id)}
                onDoubleClick={() => !isSelectMode && handlePersonDoubleClick(person!.id)}
                onContextMenu={e => !isSelectMode && handlePersonContextMenu(e, person!.id)}
                className={`flex-1 flex items-center gap-1 px-2 py-1 rounded-r border-2 text-xs select-none transition-all hover:shadow-sm ${
                  isSelectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                } ${
                  isSelected
                    ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-300'
                    : isConcurrent
                    ? 'border-dashed border-purple-300 bg-purple-50'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 leading-tight truncate">{person!.name}</div>
                  {(row.band || row.positionBand) && (
                    <div className={`text-[10px] leading-tight ${isConcurrent ? 'text-purple-500' : 'text-blue-600'}`}>
                      {row.positionBand ?? row.band}
                    </div>
                  )}
                </div>
                {!isSelectMode && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setConfirmDialog({
                        message: `${person!.name} をポジションから外しますか？\n人は未アサイン状態になります。`,
                        onConfirm: () => appService.unassignPersonFromPosition(row.rowId),
                      })
                    }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all text-[10px]"
                    title="この人を席から外す（空席化）"
                  >×</button>
                )}
                {isSelectMode && (
                  <span className={`ml-1 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'
                  }`}>{isSelected ? '✓' : ''}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
