import type { ReviewRow } from '../hooks/useReviewData'
import type { DisplayField } from './types'
import { DiffCell }       from './DiffCell'
import { IssueCell }      from './IssueCell'
import { InlineEditCell } from './InlineEditCell'
import { PATTERN_CHIP_DEFS } from './helpers'

interface Props {
  reviewRow:             ReviewRow
  allDisplayFields:      DisplayField[]
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
  val !== undefined && val !== null && val !== '' ? String(val) : undefined

const td = 'px-2 py-1 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100'

export function DiffModeRow({
  reviewRow, allDisplayFields, rowIndex,
  onFieldEdit, transferReasonOptions, isSelected, isChecked, onRowClick, onRowDoubleClick, onCheckChange,
}: Props) {
  const { row, changes, activePatterns, issues } = reviewRow
  const changed  = changes.diffCount > 0
  const hasIssue = issues.length > 0
  const i = rowIndex

  const baseBg = isChecked
    ? 'bg-blue-50'
    : isSelected
      ? 'bg-blue-100'
      : hasIssue
        ? 'bg-red-50'
        : changed
          ? i % 2 === 0 ? 'bg-orange-50' : 'bg-orange-100/60'
          : i % 2 === 0 ? 'bg-white'     : 'bg-gray-50'

  return (
    <tr
      className={`${baseBg} cursor-pointer border-b border-gray-200 hover:brightness-95 transition-[filter]`}
      onClick={() => onRowClick(row.rowId)}
      onDoubleClick={() => onRowDoubleClick(row.rowId)}
    >
      {/* チェックボックス — クリックは <td> 側で一本化（<input> の onChange と二重発火を防ぐ） */}
      <td
        className="px-1.5 py-1 border-b border-gray-100 w-6 text-center cursor-pointer"
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
      <td className="px-2 py-1 text-xs whitespace-nowrap overflow-hidden border-b border-gray-100 bg-purple-50 border-r border-purple-100 font-medium text-purple-900 text-[10px]">
        {row.assignee || <span className="text-gray-300">—</span>}
      </td>
      {/* No */}
      <td className={`${td} text-gray-400`}>{(row as Record<string, unknown>).no as number | undefined ?? <span className="text-gray-300">—</span>}</td>
      {/* ユーザーID */}
      <td className={`${td} font-mono text-gray-500 text-[10px]`}>{v(row.userId) ?? '—'}</td>
      {/* グループ社員ID */}
      <td className={`${td} font-mono text-gray-400 text-[10px]`}>{v(row.groupEmployeeId) ?? <span className="text-gray-300">—</span>}</td>
      {/* 社員番号 */}
      <td className={`${td} font-mono text-gray-400 text-[10px]`}>{v(row.employeeNumber) ?? <span className="text-gray-300">—</span>}</td>
      {/* 姓 */}
      <td className={`${td} font-medium`}>{v(row.lastName) ?? <span className="text-gray-300">—</span>}</td>
      {/* 名 */}
      <td className={td}>{v(row.firstName) ?? <span className="text-gray-300">—</span>}</td>
      {/* 異動事由（インライン編集） */}
      <InlineEditCell
        rowId={row.rowId}
        value={v(row.transferReason) ?? ''}
        options={transferReasonOptions}
        onCommit={val => onFieldEdit(row.rowId, 'transferReason', val)}
        placeholder="（未入力）"
      />
      {/* メモ */}
      <td className={`${td} max-w-[8rem] truncate`}>{v(row.memo) ?? <span className="text-gray-300">—</span>}</td>
      {/* 昇降格 */}
      <td className={`${td} text-center`}>{v(row.promotionSign) ?? ''}</td>
      {/* 降格理由 */}
      <td className={`${td} text-red-600`}>{v(row.demotionReason) ?? <span className="text-gray-300">—</span>}</td>
      {/* 給与等級変更 */}
      <td className={`${td} text-center border-r border-gray-200`}>{v(row.payGradeChangeSign) ?? ''}</td>
      {/* 変更種別 */}
      <td className={td}>
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
      {/* 差分列（After / Before を 1 列に統合：変更あり = 2 行、変更なし = 1 行） */}
      {allDisplayFields.map(f => (
        <DiffCell
          key={f.afterKey}
          after={String((row as Record<string, unknown>)[f.afterKey] ?? '')}
          before={String((row as Record<string, unknown>)[f.prevKey] ?? '')}
        />
      ))}
      {/* 除外理由 */}
      <td className={`${td} text-red-600`}>
        {v((row as Record<string, unknown>).exclusionReason) ?? <span className="text-gray-300">—</span>}
      </td>
      {/* 問題 */}
      <IssueCell rowId={row.rowId} issues={issues} />
    </tr>
  )
}
