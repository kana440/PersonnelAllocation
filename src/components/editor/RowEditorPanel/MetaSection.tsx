import { ComboInput } from '../../common/ComboInput'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  effectiveRow:         AllocationRow
  issues:               ValidationIssue[]
  readOnly:             boolean
  transferReasonOptions: string[]
  demotionReasonOptions: string[]
  onChange:             (key: keyof AllocationRow, value: string) => void
}

export function MetaSection({
  effectiveRow, issues, readOnly,
  transferReasonOptions, demotionReasonOptions,
  onChange,
}: Props) {
  const str = (key: keyof AllocationRow) =>
    (effectiveRow[key] as string | undefined) ?? ''

  return (
    <div className="flex-shrink-0 border-b border-gray-200">
      <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
        発令メタ情報
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {/* 異動事由 */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 w-16 flex-shrink-0">異動事由</label>
          <div className="flex-1">
            <ComboInput
              value={str('transferReason')}
              onChange={v => onChange('transferReason', v)}
              options={transferReasonOptions}
              disabled={readOnly}
              hasIssue={issues.some(i => i.field === 'transferReason')}
            />
          </div>
        </div>

        {/* メモ */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 w-16 flex-shrink-0">メモ</label>
          <input
            type="text"
            value={str('memo')}
            onChange={e => onChange('memo', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>

        {/* 昇降格サイン・降格事由・給与等級変更サイン */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={str('promotionSign') === '1'}
              onChange={e => onChange('promotionSign', e.target.checked ? '1' : '')}
              disabled={readOnly}
              className="accent-blue-600 disabled:cursor-not-allowed"
            />
            昇降格サイン
          </label>
          <label className="text-xs text-gray-500 flex-shrink-0">降格事由</label>
          <div className="w-36">
            <ComboInput
              value={str('demotionReason')}
              onChange={v => onChange('demotionReason', v)}
              options={demotionReasonOptions}
              disabled={readOnly}
              hasIssue={issues.some(i => i.field === 'demotionReason')}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={str('payGradeChangeSign') === '1'}
              onChange={e => onChange('payGradeChangeSign', e.target.checked ? '1' : '')}
              disabled={readOnly}
              className="accent-blue-600 disabled:cursor-not-allowed"
            />
            給与等級変更サイン
          </label>
        </div>

        {/* メタフィールドのバリデーションメッセージ */}
        {issues
          .filter(i => ['transferReason', 'memo'].includes(String(i.field)))
          .map((issue, i) => (
            <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
              {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
            </div>
          ))}
      </div>
    </div>
  )
}
