import { useOrgView }            from '../OrgViewContext'
import type { DragData, PositionEntry } from '../OrgViewContext'
import type { AllocationRow }    from '@personnel/domain/allocationRow'
import { EDIT_PATTERN_META }     from '@personnel/domain/patterns/editPattern'
import { useCanvasDisplayStore } from '../../../store/canvasDisplayStore'
import { useStore }              from '../../../store/useStore'
import { CanvasFieldDiff }       from '../components/CanvasFieldDiff'

const isInternalPosCode = (s?: string) => !s || s.startsWith('_pos_')

const getPositionTitle = (row: AllocationRow): string =>
  row.localJobTitle ??
  row.officialPositionCode ??
  (isInternalPosCode(row.positionCode) ? undefined : row.positionCode) ??
  ''

function getEmpBorderClass(
  row:      AllocationRow,
  empTypes: Array<{ label: string; isRegularEmployee: boolean; isSecondmentAcceptance: boolean }>,
): string {
  if (!row.userId) return 'border-l-gray-200'
  const entry = empTypes.find(e => e.label === row.employmentType)
  if (!entry) return row.employmentType ? 'border-l-amber-400' : 'border-l-gray-300'
  if (entry.isRegularEmployee)      return 'border-l-blue-500'
  if (entry.isSecondmentAcceptance) return 'border-l-teal-500'
  return 'border-l-amber-400'
}

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
  colorIndex?:         number   // 後方互換のため残存、未使用
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
    isSelectMode, selectedPersonIds, selectedPersonId,
    handlePersonClick,
    handleRowDoubleClick,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDropOnVacantSlot,
    isHistoryPreviewMode,
  } = useOrgView()

  const displayFields = useCanvasDisplayStore(s => s.displayFields)
  const codeLists     = useStore(s => s.codeLists)

  const isVacant     = !person
  const isConcurrent = row.concurrentType === '兼務'
  const isOnLeave    = !!row.leaveOfAbsenceSign
  const isSelected   = !isVacant && (
    isSelectMode ? selectedPersonIds.has(person!.id) : selectedPersonId === person!.id
  )
  const isDropTarget = isVacant && dragOverVacantRowId === row.rowId
  const posTitle     = getPositionTitle(row)
  const empBorder    = getEmpBorderClass(row, codeLists.employmentTypes)
  const draggable    = !isSelectMode && !isVacant && !isHistoryPreviewMode

  const bgClass =
    isSelected   ? 'bg-yellow-50' :
    isDropTarget ? 'bg-blue-50'   :
    isVacant     ? 'bg-gray-50'   :
    isConcurrent ? 'bg-purple-50' : 'bg-white'

  const borderColorClass =
    isSelected   ? 'border-yellow-400 ring-1 ring-yellow-300' :
    isDropTarget ? 'border-blue-300' : 'border-gray-200'

  const cursorClass =
    isHistoryPreviewMode      ? 'cursor-default' :
    isSelectMode && !isVacant ? 'cursor-pointer'  :
    !isVacant                 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'

  const destBadgeClass =
    comparisonStatus === 'same'          ? 'bg-gray-100 text-gray-500' :
    comparisonStatus === 'probable-same' ? 'bg-stone-100 text-stone-600' :
    DEST_BADGE_COLORS[comparisonColorIdx % DEST_BADGE_COLORS.length]

  return (
    <div style={{ paddingLeft: `${depth * 12}px` }}>
      <div
        data-personid={!isVacant ? (person?.id ?? '') : ''}
        className={`my-0.5 px-2 py-1 text-xs rounded border border-l-4 shadow-sm select-none min-w-0
          ${empBorder} ${isVacant || isOnLeave ? 'border-dashed' : ''}
          ${borderColorClass} ${bgClass} ${cursorClass}`}
        draggable={draggable}
        onDragStart={draggable ? e => {
          const data: DragData = {
            dragType: 'person', personId: person!.id,
            fromOrgId: orgId, fromCompanyId: '',
            affiliationType: isConcurrent ? 'concurrent' : 'primary',
            source: 'after', fromRowId: row.rowId, rowId: row.rowId, fromPanelId: panelId,
          }
          e.dataTransfer.setData('application/json', JSON.stringify(data))
          e.dataTransfer.effectAllowed = 'move'
        } : undefined}
        onClick={e => {
          if (isVacant || isHistoryPreviewMode) return
          handlePersonClick(person!.id, panelId, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
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
        onDragOver={isVacant ? e => {
          if (!e.dataTransfer.types.includes('application/json')) return
          e.preventDefault(); e.stopPropagation()
          setDragOverVacantRowId(row.rowId)
        } : undefined}
        onDragLeave={isVacant ? () => setDragOverVacantRowId(null) : undefined}
        onDrop={isVacant ? e => {
          setDragOverVacantRowId(null)
          handleDropOnVacantSlot(e, row.rowId)
        } : undefined}
      >
        {/* 1行目: [兼] 氏名 社員ID 変更バッジ */}
        <div className="flex items-center gap-1 min-w-0">
          {isConcurrent && (
            <span className="flex-shrink-0 text-[9px] font-bold bg-purple-100 text-purple-600 px-0.5 py-0.5 rounded leading-none">兼</span>
          )}
          {isVacant ? (
            <span className={`italic truncate flex-1 ${isDropTarget ? 'text-blue-600' : 'text-gray-400'}`}>
              {posTitle || '（空席）'}
            </span>
          ) : (
            <span className="font-semibold text-gray-800 truncate flex-1 leading-tight">{person!.name}</span>
          )}
          {!isVacant && row.groupEmployeeId && (
            <span className="flex-shrink-0 text-[9px] text-gray-300 font-mono">{row.groupEmployeeId}</span>
          )}
          {[...activePatterns].map(p => {
            const meta = EDIT_PATTERN_META[p]
            return (
              <span key={p} className={`flex-shrink-0 text-[9px] font-medium px-0.5 py-0.5 rounded leading-none ${meta.badgeColor}`}>
                {meta.label}
              </span>
            )
          })}
          {isSelectMode && !isVacant && (
            <span className={`ml-auto flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] font-bold ${
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
