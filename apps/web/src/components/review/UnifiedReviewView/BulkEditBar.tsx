import { useState, useMemo } from 'react'
import { getGroupedFieldOptions } from '@personnel/domain/rules/options'
import { OPTIONAL_COLUMNS, INLINE_EDIT_FIELDS } from '../components/BulkFieldEditModal/helpers'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'

// 一括編集対象: after列のうちインライン専用フィールド（userId等）を除いたもの
const BULK_EDIT_FIELDS = OPTIONAL_COLUMNS.filter(
  c => c.section === 'after' && !INLINE_EDIT_FIELDS.has(c.field)
)

interface Props {
  filteredCount: number
  masters:       AllMasters
  firstRow:      AllocationRow | undefined
  onApply:       (field: string, value: string) => void
}

export function BulkEditBar({ filteredCount, masters, firstRow, onApply }: Props) {
  const [field, setField] = useState('')
  const [value, setValue] = useState('')

  const fieldOptions = useMemo(() => {
    if (!field || !firstRow) return []
    return getGroupedFieldOptions(field, firstRow, masters).valid
  }, [field, firstRow, masters])

  const canApply = !!field && !!value && filteredCount > 0

  const handleApply = () => {
    if (!canApply) return
    onApply(field, value)
    setValue('')
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1 border-b border-gray-200 bg-amber-50">
      <span className="text-[10px] text-amber-700 font-medium flex-shrink-0">一括編集</span>

      {/* フィールド選択 */}
      <select
        value={field}
        onChange={e => { setField(e.target.value); setValue('') }}
        className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 flex-shrink-0 max-w-[9rem]"
      >
        <option value="">フィールドを選択...</option>
        {BULK_EDIT_FIELDS.map(c => (
          <option key={c.field} value={c.field}>{c.label}</option>
        ))}
      </select>

      {/* 値入力 */}
      {field && (
        fieldOptions.length > 0 ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
          >
            <option value="">値を選択...</option>
            {fieldOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="値を入力..."
            className="flex-1 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
          />
        )
      )}

      {/* 適用ボタン */}
      <button
        onClick={handleApply}
        disabled={!canApply}
        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap transition-colors ${
          canApply
            ? 'bg-amber-600 text-white hover:bg-amber-700'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {filteredCount} 件に適用 →
      </button>
    </div>
  )
}
