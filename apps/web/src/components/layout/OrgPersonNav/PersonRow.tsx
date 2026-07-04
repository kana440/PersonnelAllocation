import { useRowSelectionStore } from '../../../store/rowSelectionStore'
import { PATTERN_CHIP_DEFS }    from '../../review/UnifiedReviewView/helpers'
import type { CompactPersonRow } from './useCompactData'

interface Props {
  row:           CompactPersonRow
  fromOrgId:     string | null
  onFocus:       (rowId: number) => void
  onDoubleClick: (rowId: number) => void
}

export function PersonRow({ row, fromOrgId, onFocus, onDoubleClick }: Props) {
  const isChecked = useRowSelectionStore(s => s.selectedRowIds.has(row.rowId))
  const toggleRow = useRowSelectionStore(s => s.toggleRow)

  const activeChips = PATTERN_CHIP_DEFS.filter(d => row.patterns.has(d.key))

  const baseBg = isChecked
    ? 'bg-blue-50 hover:bg-blue-100'
    : row.hasIssues
      ? 'bg-red-50 hover:bg-red-100'
      : row.hasChanges
        ? 'hover:bg-orange-50'
        : 'hover:bg-gray-50'

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${baseBg}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          dragType:        'person',
          personId:        row.userId,
          fromOrgId:       fromOrgId ?? '',
          fromCompanyId:   '',
          affiliationType: row.isConcurrent ? 'concurrent' : 'primary',
          source:          'sidebar',
          fromRowId:       row.rowId,
          rowId:           row.rowId,
        }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onFocus(row.rowId)}
      onDoubleClick={() => onDoubleClick(row.rowId)}
    >
      {/* チェックボックス — ここだけ多重選択 */}
      <div
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
        onClick={e => { e.stopPropagation(); toggleRow(row.rowId) }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          readOnly
          className="accent-blue-600 w-3 h-3 pointer-events-none"
        />
      </div>

      {/* 氏名 */}
      <span className={`flex-1 text-[11px] truncate ${row.hasIssues ? 'text-red-700 font-medium' : 'text-gray-800'}`}>
        {row.name}
      </span>

      {/* 変更種別バッジ（最大2件）*/}
      <div className="flex gap-0.5 flex-shrink-0">
        {activeChips.slice(0, 2).map(d => (
          <span key={d.key} className={`px-1 py-0.5 rounded text-[9px] border leading-none ${d.color}`}>
            {d.label}
          </span>
        ))}
        {activeChips.length > 2 && (
          <span className="px-1 py-0.5 rounded text-[9px] bg-gray-100 text-gray-500 border border-gray-200 leading-none">
            +{activeChips.length - 2}
          </span>
        )}
        {row.hasIssues && (
          <span className="px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-600 border border-red-200 leading-none" title="問題���り">
            ⚠
          </span>
        )}
      </div>
    </div>
  )
}
