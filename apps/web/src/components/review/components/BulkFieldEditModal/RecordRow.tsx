import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { ColumnDef, ModalMode } from './helpers'

interface Props {
  row:            AllocationRow
  field:          string
  fieldLabel:     string
  orgPath:        string
  visibleColumns: ColumnDef[]
  mode:           ModalMode
  /** pair モード: "jobFamily / jobType" をまとめて表示 */
  isPair?:        boolean
  /** inline モード: 編集中の値 */
  editValue?:     string
  onEditChange?:  (val: string) => void
}

function cellVal(row: AllocationRow, field: string): string {
  return String((row as Record<string, unknown>)[field] ?? '')
}

export function RecordRow({
  row, field, fieldLabel, orgPath, visibleColumns, mode, isPair, editValue, onEditChange,
}: Props) {
  const name   = [row.lastName, row.firstName].filter(Boolean).join(' ')
  const curVal = isPair
    ? [cellVal(row, 'jobFamily'), cellVal(row, 'jobType')].filter(Boolean).join(' / ')
    : cellVal(row, field)

  return (
    <div className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
      {/* 1行目: 氏名 + オプション列 + 現在値 */}
      <div className="flex items-center gap-3 px-4 pt-1.5 pb-0.5 text-xs">
        <span className="font-medium text-gray-800 min-w-[8rem] shrink-0 truncate">
          {name || '（空席）'}
        </span>
        {visibleColumns.map(col => (
          <span key={col.field} className="text-gray-500 text-[11px] shrink-0 truncate max-w-[7rem]" title={col.label}>
            {cellVal(row, col.field) || '—'}
          </span>
        ))}
        <span className="ml-auto shrink-0 min-w-[10rem] text-right">
          {mode === 'inline' ? (
            <input
              type="text"
              value={editValue ?? curVal}
              onChange={e => onEditChange?.(e.target.value)}
              className="w-full text-[11px] border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-left"
              placeholder={`${fieldLabel}を入力`}
            />
          ) : (
            <span className={curVal ? 'text-gray-600' : 'text-red-400 italic'}>
              {curVal || '（未設定）'}
            </span>
          )}
        </span>
      </div>
      {/* 2行目: 組織階層パス */}
      <div className="px-4 pb-1.5 text-[10px] text-gray-400 truncate">
        {orgPath || '—'}
      </div>
    </div>
  )
}
