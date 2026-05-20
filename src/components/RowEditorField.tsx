import { ComboInput } from './ComboInput'
import type { ValidationIssue } from '../domain/validation/validateRow'

interface Props {
  label:      string
  beforeVal:  string
  afterVal:   string
  onChange:   (v: string) => void
  options?:   string[]          // コードリストがある場合はドロップダウン候補
  issues?:    ValidationIssue[]
  readOnly?:  boolean           // メタフィールドを条件付き読み取り専用にする場合
}

export function RowEditorField({ label, beforeVal, afterVal, onChange, options, issues, readOnly }: Props) {
  const hasError   = issues?.some(i => i.level === 'error')
  const hasWarning = issues?.some(i => i.level === 'warning')
  const hasDiff    = beforeVal !== afterVal

  const rowBg = hasError
    ? 'bg-red-50'
    : hasWarning
    ? 'bg-orange-50'
    : hasDiff
    ? 'bg-blue-50'
    : ''

  return (
    <div className={`grid grid-cols-[8rem_1fr_1fr] gap-x-2 items-start px-3 py-1.5 border-b border-gray-100 ${rowBg}`}>
      {/* フィールド名 */}
      <div className="text-xs text-gray-500 leading-5 truncate pt-0.5">{label}</div>

      {/* 新（発令後・編集可）← LEFT */}
      <div className="space-y-0.5">
        <ComboInput
          value={afterVal}
          onChange={onChange}
          options={options ?? []}
          disabled={readOnly}
          hasIssue={hasError || hasWarning}
        />
        {issues?.map((issue, i) => (
          <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
            {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
          </div>
        ))}
      </div>

      {/* 旧（発令前・参照）← RIGHT */}
      <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px] break-all">
        {beforeVal || <span className="text-gray-300">—</span>}
      </div>
    </div>
  )
}
