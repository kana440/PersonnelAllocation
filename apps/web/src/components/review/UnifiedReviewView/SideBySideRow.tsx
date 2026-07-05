import type { ReviewRow } from '../hooks/useReviewData'
import type { DisplayField } from './types'
import { InlineEditCell } from './InlineEditCell'
import { PATTERN_CHIP_DEFS } from './helpers'

interface Props {
  reviewRow:             ReviewRow
  allDisplayFields:      DisplayField[]   // 全 BEFORE_AFTER_FIELD_PAIRS
  rowIndex:              number
  onFieldEdit:           (rowId: number, field: string, value: string) => void
  transferReasonOptions: string[]
  isSelected:            boolean
  isChecked:             boolean
  onRowClick:            (rowId: number) => void
  onRowDoubleClick:      (rowId: number) => void
  onCheckChange:         (rowId: number) => void
}

const v = (val: unknown) =>
  val !== undefined && val !== null && val !== ''
    ? String(val)
    : undefined

const tdM = 'px-2 py-1.5 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100'
const tdA = 'px-2 py-1.5 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100 bg-green-50'
const tdB = 'px-2 py-1.5 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100 bg-blue-50'

export function SideBySideRow({
  reviewRow, allDisplayFields, rowIndex,
  onFieldEdit, transferReasonOptions, isSelected, isChecked, onRowClick, onRowDoubleClick, onCheckChange,
}: Props) {
  const { row, changes, activePatterns } = reviewRow
  const changed = changes.diffCount > 0
  const i = rowIndex

  const baseBg = isChecked
    ? 'bg-blue-50'
    : isSelected
      ? 'bg-blue-100'
      : changed
        ? i % 2 === 0 ? 'bg-orange-50' : 'bg-orange-100/60'
        : i % 2 === 0 ? 'bg-white'     : 'bg-gray-50'

  return (
    <tr
      className={`${baseBg} cursor-pointer border-b border-gray-200`}
      onClick={() => onRowClick(row.rowId)}
      onDoubleClick={() => onRowDoubleClick(row.rowId)}
    >
      {/* チェックボックス — クリックは <td> 側で一本化（<input> の onChange と二重発火を防ぐ） */}
      <td
        className="px-1.5 py-1.5 border-b border-gray-100 w-6 text-center cursor-pointer"
        onClick={e => { e.stopPropagation(); onCheckChange(row.rowId) }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          readOnly
          className="accent-blue-600 w-3 h-3 pointer-events-none"
        />
      </td>
      {/* 担当者 */}
      <td className="px-2 py-1.5 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100 bg-purple-50 border-r border-purple-100 font-medium text-purple-900 text-[10px]">
        {row.assignee || <span className="text-gray-300">—</span>}
      </td>
      {/* No / メタ */}
      <td className={`${tdM} text-gray-400`}>{(row as Record<string, unknown>).no as number | undefined}</td>
      <td className={`${tdM} font-mono text-gray-500 text-[10px]`}>{v(row.userId) ?? '—'}</td>
      <td className={`${tdM} font-mono text-gray-400 text-[10px]`}>{v(row.groupEmployeeId) ?? <span className="text-gray-300">—</span>}</td>
      <td className={`${tdM} font-mono text-gray-400 text-[10px]`}>{v(row.employeeNumber) ?? <span className="text-gray-300">—</span>}</td>
      <td className={`${tdM} font-medium`}>{v(row.lastName) ?? <span className="text-gray-300">—</span>}</td>
      <td className={tdM}>{v(row.firstName) ?? <span className="text-gray-300">—</span>}</td>
      {/* 異動事由（インライン編集） */}
      <InlineEditCell
        rowId={row.rowId}
        value={v(row.transferReason) ?? ''}
        options={transferReasonOptions}
        onCommit={val => onFieldEdit(row.rowId, 'transferReason', val)}
        placeholder="（未入力）"
      />
      {/* memo / サイン系 */}
      <td className={`${tdM} max-w-[8rem] truncate`}>{v(row.memo) ?? <span className="text-gray-300">—</span>}</td>
      <td className={`${tdM} text-center`}>{v(row.promotionSign) ?? ''}</td>
      <td className={`${tdM} text-red-600`}>{v(row.demotionReason) ?? <span className="text-gray-300">—</span>}</td>
      <td className={`${tdM} text-center border-r border-gray-200`}>{v(row.payGradeChangeSign) ?? ''}</td>
      {/* 変更種別 */}
      <td className={tdM}>
        <div className="flex flex-nowrap gap-0.5 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
          onWheel={e => { e.currentTarget.scrollLeft += e.deltaY }}
        >
          {PATTERN_CHIP_DEFS
            .filter(d => activePatterns.has(d.key))
            .map(d => (
              <span key={d.key} className={`px-1 py-0.5 rounded text-[9px] border ${d.color}`}>{d.label}</span>
            ))
          }
          {changes.bandMismatch && (
            <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700 border border-amber-200">⚠Band</span>
          )}
        </div>
      </td>
      {/* After 列 */}
      {allDisplayFields.map(f => {
        const val = v((row as Record<string, unknown>)[f.afterKey])
        return (
          <td key={`a_${f.afterKey}`} className={tdA}>
            {val ?? <span className="text-gray-300">—</span>}
          </td>
        )
      })}
      {/* Before 列 */}
      {allDisplayFields.map(f => {
        const val = v((row as Record<string, unknown>)[f.prevKey])
        return (
          <td key={`b_${f.prevKey}`} className={tdB}>
            {val ?? <span className="text-gray-300">—</span>}
          </td>
        )
      })}
      {/* 除外理由 */}
      <td className={`${tdM} text-red-600`}>
        {v((row as Record<string, unknown>).exclusionReason) ?? <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
