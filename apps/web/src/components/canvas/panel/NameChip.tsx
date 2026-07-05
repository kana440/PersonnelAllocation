import { useState }  from 'react'
import { useStore }   from '../../../store/useStore'
import { useOrgView } from '../OrgViewContext'
import type { PositionEntry, DragData } from '../OrgViewContext'
import { isVacantRow } from '@personnel/domain/allocationRow'

interface Props {
  entry:   PositionEntry
  orgId:   string
  panelId: string
}

export function NameChip({ entry, orgId, panelId }: Props) {
  const { isHistoryPreviewMode } = useStore()
  const { setDragOverOrgId, isSelectMode, handlePersonClick, handleRowDoubleClick, openDropIntent, handleDropOnVacantSlot } = useOrgView()
  const isCardSelected = useStore(s => !isVacantRow(entry.row) && !isSelectMode && s.selectedCardRowId === entry.row.rowId)
  const [isDragOver, setIsDragOver] = useState(false)

  const { row, person } = entry
  const isVacant     = isVacantRow(row)
  const isConcurrent = (row.concurrentType as string | undefined) === '兼務'
  const name         = isVacant
    ? '空席'
    : [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || '（名前不明）'
  // person.id === sfPersonId。SF未登録時は row.userId でフォールバック
  const personId     = person?.id ?? row.userId

  const draggable = !isHistoryPreviewMode

  const chipClass = isCardSelected
    ? 'border-yellow-400 ring-1 ring-yellow-300 bg-yellow-50 text-gray-800'
    : isVacant
      ? isDragOver
        ? 'border-blue-400 bg-blue-50 text-blue-600 border-dashed italic'
        : 'border-gray-300 bg-gray-50 text-gray-400 border-dashed italic'
      : isConcurrent
        ? 'border-purple-400 bg-purple-50 text-gray-700'
        : 'border-blue-400 bg-white text-gray-800 hover:bg-blue-50'

  const handleDragOver = !isHistoryPreviewMode ? (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    if (e.dataTransfer.types.includes('application/x-position-drag')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  } : undefined

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = !isHistoryPreviewMode ? (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    if (data.dragType !== 'person' || !data.personId) return
    if (data.fromRowId === row.rowId) return
    if (isVacant) {
      // 空席チップへのドロップ → 空Posへ移動ダイアログを開く
      handleDropOnVacantSlot(e, row.rowId)
    } else {
      // 在席チップへのドロップ → 上司変更など（既存の person drop 処理）
      openDropIntent({
        fromRowId:           data.fromRowId ?? null,
        personId:            data.personId,
        toOrgId:             orgId,
        fromOrgId:           data.fromOrgId,
        dropType:            'person',
        managerPositionCode: row.positionCode as string | undefined,
      })
    }
  } : undefined

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
            dragType: 'person', personId: personId,
            fromOrgId: orgId, fromCompanyId: '',
            affiliationType: isConcurrent ? 'concurrent' : 'primary',
            source: 'after', fromRowId: row.rowId, rowId: row.rowId, fromPanelId: panelId,
          }
          e.dataTransfer.setData('application/json', JSON.stringify(data))
        }
        e.dataTransfer.effectAllowed = 'move'
      } : undefined}
      onDragEnd={() => { setDragOverOrgId(null); setIsDragOver(false) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-rowid={row.rowId}
      onClick={e => {
        if (isVacant || isHistoryPreviewMode || !personId) return
        handlePersonClick(personId, panelId, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }, row.rowId)
      }}
      onDoubleClick={e => {
        if (!isSelectMode && !isHistoryPreviewMode) handleRowDoubleClick(e, row.rowId)
      }}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border border-l-2 cursor-pointer select-none transition-colors ${chipClass} ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-1 bg-blue-50' : ''}`}
    >
      {name}
    </div>
  )
}
