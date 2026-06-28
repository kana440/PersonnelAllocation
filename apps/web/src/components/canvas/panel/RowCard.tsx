import { useOrgView }            from '../OrgViewContext'
import type { DragData, PositionEntry } from '../OrgViewContext'
import { EDIT_PATTERN_META }     from '@personnel/domain/patterns/editPattern'
import { useCanvasDisplayStore } from '../../../store/canvasDisplayStore'
import { useStore }              from '../../../store/useStore'
import { CanvasFieldDiff }       from '../components/CanvasFieldDiff'
import { OPERATION_BADGE_COLORS } from '../../../config/badgeColors'
import { isInternalPosCode, getPositionTitle, getEmpBorderClass } from './helpers'

const DEST_BADGE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
]

export interface RowCardProps {
  entry:               PositionEntry
  orgId:               string
  panelId:             string
  colorIndex?:         number
  comparisonStatus?:   'same' | 'probable-same' | 'other'
  comparisonOrgName?:  string
  comparisonColorIdx?: number
}

export function RowCard({
  entry, orgId, panelId,
  comparisonStatus, comparisonOrgName, comparisonColorIdx = 0,
}: RowCardProps) {
  const { row, person, depth, activePatterns } = entry
  const {
    isSelectMode, selectedPersonIds, selectedCardRowId,
    handlePersonClick,
    handleRowDoubleClick,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDropOnVacantSlot,
    handleDropPositionOnPosition,
    isHistoryPreviewMode,
    dropPersonRowId, setDropPersonRowId,
    dropGapBelowRowId, setDropGapBelowRowId,
    setDragOverOrgId,
    openDropIntent,
    positionTreeByOrgId,
  } = useOrgView()

  const displayFields    = useCanvasDisplayStore(s => s.displayFields)
  const hiddenBadgeTypes = useCanvasDisplayStore(s => s.hiddenBadgeTypes)
  const masters       = useStore(s => s.masters)

  const clearDropTargets = () => {
    setDropPersonRowId(null)
    setDropGapBelowRowId(null)
    setDragOverOrgId(null)
  }

  const computeGapManager = (): string | undefined => {
    const entries = positionTreeByOrgId.get(orgId) ?? []
    const idx = entries.findIndex(e => e.row.rowId === row.rowId)
    const next = idx >= 0 ? entries[idx + 1] : undefined
    // 次カードが現カードより深い = 現カードのサブツリーに挿入 → 現カードが上司
    // それ以外（同depth・浅い・末尾）= 現カードと同じチーム → 現カードの上司を引き継ぐ
    return (next && next.depth > entry.depth)
      ? (row.positionCode ?? undefined)
      : (row.managerPositionCode ?? undefined)
  }

  const handleDropAsGap = (data: DragData) => {
    if (!data.personId || data.personId === person?.id) return
    clearDropTargets()
    openDropIntent({
      fromRowId:           data.fromRowId ?? null,
      personId:            data.personId,
      toOrgId:             orgId,
      fromOrgId:           data.fromOrgId,
      dropType:            'gap',
      managerPositionCode: computeGapManager(),
    })
  }

  const handleDropAsPerson = (data: DragData) => {
    if (!data.personId || data.personId === person?.id) return
    clearDropTargets()
    openDropIntent({
      fromRowId:           data.fromRowId ?? null,
      personId:            data.personId,
      toOrgId:             orgId,
      fromOrgId:           data.fromOrgId,
      dropType:            'person',
      managerPositionCode: row.positionCode ?? undefined,
    })
  }

  const isVacant           = !person
  const isConcurrent       = row.concurrentType === '兼務'
  const isOnLeave          = !!row.leaveOfAbsenceSign
  const isSelected         = !isVacant && (
    isSelectMode ? selectedPersonIds.has(person!.id) : selectedCardRowId === row.rowId
  )
  const isDropTarget       = isVacant && dragOverVacantRowId === row.rowId
  const isPersonDropTarget = !isVacant && !isSelectMode && dropPersonRowId   === row.rowId
  const isGapDropTarget    = !isVacant && !isSelectMode && dropGapBelowRowId === row.rowId
  const posTitle           = getPositionTitle(row)
  const empBorder          = getEmpBorderClass(row, masters.employmentTypes)
  // 空席ポジションも positionCode があればドラッグ可（別組織への移動・レポートライン変更）
  const draggableVacant    = isVacant && !!row.positionCode && !isSelectMode && !isHistoryPreviewMode
  const draggable          = !isSelectMode && !isHistoryPreviewMode && (!isVacant || draggableVacant)

  const bgClass =
    isSelected         ? 'bg-yellow-50' :
    isPersonDropTarget ? 'bg-green-50'  :
    isDropTarget       ? 'bg-blue-50'   :
    isVacant           ? 'bg-gray-50'   :
    isConcurrent       ? 'bg-purple-50' : 'bg-white'

  const borderColorClass =
    isSelected         ? 'border-yellow-400 ring-1 ring-yellow-300' :
    isPersonDropTarget ? 'border-green-400 ring-2 ring-green-200'   :
    isDropTarget       ? 'border-blue-300' : 'border-gray-200'

  const cursorClass =
    isHistoryPreviewMode         ? 'cursor-default' :
    isSelectMode && !isVacant    ? 'cursor-pointer'  :
    !isVacant || draggableVacant ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'

  const destBadgeClass =
    comparisonStatus === 'same'          ? 'bg-gray-100 text-gray-500' :
    comparisonStatus === 'probable-same' ? 'bg-stone-100 text-stone-600' :
    DEST_BADGE_COLORS[comparisonColorIdx % DEST_BADGE_COLORS.length]

  return (
    <div style={{ paddingLeft: `${depth * 12}px` }}>
      <div
        data-personid={!isVacant ? (person?.id ?? '') : ''}
        data-rowid={!isVacant ? row.rowId : ''}
        className={`relative my-0.5 px-2 py-1 text-xs rounded border border-l-4 shadow-sm select-none min-w-0
          ${empBorder} ${isVacant || isOnLeave ? 'border-dashed' : ''}
          ${borderColorClass} ${bgClass} ${cursorClass}`}
        draggable={draggable}
        onDragStart={draggable ? e => {
          if (isVacant) {
            // 空席ポジションのドラッグ: 別組織への移動・レポートライン変更に使用
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
        onClick={e => {
          if (isVacant || isHistoryPreviewMode) return
          handlePersonClick(person!.id, panelId, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }, row.rowId)
        }}
        onContextMenu={e => {
          if ((e.ctrlKey || e.metaKey) && !isVacant && !isHistoryPreviewMode) {
            e.preventDefault()
            handlePersonClick(person!.id, panelId, { ctrl: true, shift: false })
          }
        }}
        onDoubleClick={e => {
          if (!isSelectMode && !isHistoryPreviewMode) handleRowDoubleClick(e, row.rowId)
        }}
        onDragOver={
          isVacant ? e => {
            if (!e.dataTransfer.types.includes('application/json')) return
            if (e.dataTransfer.types.includes('application/x-unmapped-bulk')) return
            e.preventDefault(); e.stopPropagation()
            setDragOverVacantRowId(row.rowId)
          } :
          !isSelectMode && !isHistoryPreviewMode ? e => {
            if (!e.dataTransfer.types.includes('application/json')) return
            if (e.dataTransfer.types.includes('application/x-unmapped-bulk')) return
            e.preventDefault(); e.stopPropagation()
            setDragOverOrgId(null)
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            if ((e.clientY - rect.top) / rect.height > 0.65) {
              setDropPersonRowId(null)
              setDropGapBelowRowId(row.rowId)
            } else {
              setDropPersonRowId(row.rowId)
              setDropGapBelowRowId(null)
            }
          } : undefined
        }
        onDragLeave={
          isVacant ? () => setDragOverVacantRowId(null) :
          !isSelectMode && !isHistoryPreviewMode ? e => {
            if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) {
              setDropPersonRowId(null)
              setDropGapBelowRowId(null)
            }
          } : undefined
        }
        onDrop={
          isVacant ? e => {
            setDragOverVacantRowId(null)
            let data: DragData
            try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
            if (data.dragType === 'position') {
              // ポジションを空席カードの上にドロップ → レポートライン変更
              handleDropPositionOnPosition(e, row.rowId)
            } else {
              // 人を空席スロットにドロップ → 担当者をアサイン
              handleDropOnVacantSlot(e, row.rowId)
            }
          } :
          !isSelectMode && !isHistoryPreviewMode ? e => {
            e.preventDefault(); e.stopPropagation()
            let data: DragData
            try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
            if (data.dragType === 'position') {
              // ポジションを在席カードの上にドロップ → レポートライン変更
              handleDropPositionOnPosition(e, row.rowId)
              return
            }
            if (!data.personId) return
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            if ((e.clientY - rect.top) / rect.height > 0.65) {
              handleDropAsGap(data)
            } else {
              handleDropAsPerson(data)
            }
          } : undefined
        }
      >
        {/* 1行目: [兼] 氏名 社員ID [spacer] 変更バッジ右詰め */}
        <div className="flex items-center gap-1 min-w-0">
          {isConcurrent && (
            <span className="flex-shrink-0 text-[9px] font-bold bg-purple-100 text-purple-600 px-0.5 py-0.5 rounded leading-none">兼</span>
          )}
          {isVacant ? (
            <span className={`italic truncate flex-1 ${isDropTarget ? 'text-blue-600' : 'text-gray-400'}`}>
              {posTitle || '（空席）'}
            </span>
          ) : (
            <>
              <span className="font-semibold text-gray-800 truncate leading-tight min-w-0">{person!.name}</span>
              {row.groupEmployeeId && (
                <span className="flex-shrink-0 text-[9px] text-gray-300 font-mono">{row.groupEmployeeId}</span>
              )}
              {/* spacer: 残りスペースを吸収してバッジを右端へ */}
              <div className="flex-1" />
            </>
          )}
          {[...activePatterns].filter(p => !hiddenBadgeTypes.includes(EDIT_PATTERN_META[p].badge)).map(p => {
            const meta = EDIT_PATTERN_META[p]
            return (
              <span key={p} className={`flex-shrink-0 text-[9px] font-medium px-0.5 py-0.5 rounded leading-none ${OPERATION_BADGE_COLORS[meta.badge]}`}>
                {meta.label}
              </span>
            )
          })}
          {isSelectMode && !isVacant && (
            <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] font-bold ${
              isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'
            }`}>{isSelected ? '✓' : ''}</span>
          )}
        </div>

        {/* 2行目 (在籍時): 職位 posCode 雇用タイプ 休職バッジ */}
        {!isVacant && (
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {posTitle && <span className="text-gray-600 truncate">{posTitle}</span>}
            {!isInternalPosCode(row.positionCode) && row.positionCode && (
              <span className="flex-shrink-0 text-[9px] text-gray-300 font-mono">{row.positionCode}</span>
            )}
            {row.employmentType && (
              <span className="flex-shrink-0 text-[9px] text-gray-400 truncate max-w-[4rem]">{row.employmentType}</span>
            )}
            {isOnLeave && (
              <span className="flex-shrink-0 text-[9px] font-medium text-orange-500 bg-orange-50 px-1 rounded">休職</span>
            )}
          </div>
        )}

        {/* 空席: ドロップヒント */}
        {isVacant && (
          <div className={`text-[9px] mt-0.5 ${isDropTarget ? 'text-blue-500' : 'text-gray-300'}`}>
            {isDropTarget ? 'ここにドロップ' : '← ドロップして配属'}
          </div>
        )}

        {/* ギャップゾーン: カード下端に破線インジケーター（absolute, pointer-events:auto） */}
        {isGapDropTarget && (
          <div
            className="absolute left-0 right-0 z-20"
            style={{
              top:          'calc(100% + 2px)',
              height:       '15px',
              border:       '1.5px dashed #3b82f6',
              borderRadius: '3px',
              background:   'rgba(239,246,255,0.85)',
              cursor:       'copy',
            }}
            onDragOver={e => {
              if (!e.dataTransfer.types.includes('application/json')) return
              if (e.dataTransfer.types.includes('application/x-unmapped-bulk')) return
              e.preventDefault()
            }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation()
              let data: DragData
              try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
              handleDropAsGap(data)
            }}
          />
        )}

        {/* 3行目 (在籍時): カスタム項目 + 比較先バッジ */}
        {!isVacant && (displayFields.length > 0 || comparisonOrgName) && (
          <div className="mt-0.5 min-w-0">
            <CanvasFieldDiff row={row} displayFields={displayFields} isConcurrent={isConcurrent} />
            {comparisonOrgName && (
              <span className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded font-medium mt-0.5 ${destBadgeClass}`}>
                → {comparisonOrgName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
