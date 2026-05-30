import { ComboInput } from '../../common/ComboInput'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  effectiveRow:          AllocationRow
  issues:                ValidationIssue[]
  readOnly:              boolean
  transferReasonOptions: string[]
  demotionReasonOptions: string[]
  onChange:              (key: keyof AllocationRow, value: string) => void
}

const INPUT = [
  'border border-gray-200 rounded px-2 py-1 text-xs text-gray-700',
  'focus:outline-none focus:ring-1 focus:ring-blue-300',
  'disabled:bg-transparent disabled:border-transparent disabled:cursor-default disabled:text-gray-600',
].join(' ')

function SignBadge({ value }: { value: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      value === '1' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
    }`}>
      {value === '1' ? 'あり' : 'なし'}
    </span>
  )
}

export function MetaSection({
  effectiveRow, issues, readOnly,
  transferReasonOptions, demotionReasonOptions,
  onChange,
}: Props) {
  const str = (key: keyof AllocationRow) =>
    (effectiveRow[key] as string | undefined) ?? ''
  const no = (effectiveRow as Record<string, unknown>).no as string | undefined

  const LABEL_W = 'w-24'

  return (
    <div className="flex-shrink-0 border-b border-gray-200">

      {/* セクションヘッダー */}
      <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">管理項目</span>
        {no && <span className="text-[10px] text-gray-300 tabular-nums">行 {no}</span>}
      </div>

      <div className="px-3 py-2 space-y-1.5">

        {/* ── 個人識別 ＋ サイン（左右2カラム） ── */}
        <div className="flex gap-2">

          {/* 左：個人情報 2行 */}
          <div className="flex-1 space-y-1.5 min-w-0">

            {/* 行1：ユーザー/社員ID と 社員番号 */}
            <div className="flex items-center gap-1.5">
              <label className={`text-xs text-gray-500 flex-shrink-0 ${LABEL_W}`}>ユーザー/社員ID</label>
              <input
                type="text"
                value={str('userId')}
                onChange={e => onChange('userId', e.target.value)}
                disabled={readOnly}
                className={`w-24 ${INPUT}`}
              />
              <label className="text-xs text-gray-400 flex-shrink-0">社員番号</label>
              <input
                type="text"
                value={str('employeeNumber')}
                onChange={e => onChange('employeeNumber', e.target.value)}
                disabled={readOnly}
                className={`flex-1 min-w-0 ${INPUT}`}
              />
            </div>

            {/* 行2：氏名（姓・名 均等） */}
            <div className="flex items-center gap-1.5">
              <label className={`text-xs text-gray-500 flex-shrink-0 ${LABEL_W}`}>氏名</label>
              <input
                type="text"
                value={str('lastName')}
                onChange={e => onChange('lastName', e.target.value)}
                disabled={readOnly}
                placeholder="姓"
                className={`flex-1 min-w-0 ${INPUT}`}
              />
              <input
                type="text"
                value={str('firstName')}
                onChange={e => onChange('firstName', e.target.value)}
                disabled={readOnly}
                placeholder="名"
                className={`flex-1 min-w-0 ${INPUT}`}
              />
            </div>
          </div>

          {/* 右：昇降格・給与変更・降格理由（コンパクト縦並び） */}
          <div className="flex-shrink-0 flex flex-col justify-center gap-1 border-l border-gray-100 pl-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 w-12 text-right flex-shrink-0">昇降格</span>
              <SignBadge value={str('promotionSign')} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 w-12 text-right flex-shrink-0">給与変更</span>
              <SignBadge value={str('payGradeChangeSign')} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 w-12 text-right flex-shrink-0">降格理由</span>
              <div className="w-20">
                <ComboInput
                  value={str('demotionReason')}
                  onChange={v => onChange('demotionReason', v)}
                  options={demotionReasonOptions}
                  disabled={readOnly}
                  hasIssue={issues.some(i => i.field === 'demotionReason')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── 異動事由 ＋ メモ ── */}
        <div className="pt-1.5 border-t border-gray-100 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className={`text-xs text-gray-500 flex-shrink-0 ${LABEL_W}`}>異動事由</label>
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
          <div className="flex items-center gap-1.5">
            <label className={`text-xs text-gray-400 flex-shrink-0 ${LABEL_W} pl-3`}>└ メモ</label>
            <input
              type="text"
              value={str('memo')}
              onChange={e => onChange('memo', e.target.value)}
              disabled={readOnly}
              className={`flex-1 ${INPUT}`}
            />
          </div>
        </div>

        {/* バリデーション */}
        {issues
          .filter(i => ['transferReason', 'memo', 'demotionReason'].includes(String(i.field)))
          .map((issue, idx) => (
            <div key={idx} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
              {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
            </div>
          ))}

      </div>
    </div>
  )
}
