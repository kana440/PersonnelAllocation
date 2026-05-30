import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  label:    string
  afterVal: string
  prevVal:  string
  issues:   ValidationIssue[]
  readOnly: boolean
  onChange: (v: string) => void
}

export function BooleanFieldRow({ label, afterVal, prevVal, issues, readOnly, onChange }: Props) {
  const hasError   = issues.some(i => i.level === 'error')
  const hasWarning = issues.some(i => i.level === 'warning')
  const hasDiff    = afterVal !== prevVal
  const rowBg      = hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : hasDiff ? 'bg-blue-50' : ''

  return (
    <div className={`grid grid-cols-[8rem_1fr_1fr] gap-x-2 items-center px-3 py-1.5 border-b border-gray-100 ${rowBg}`}>
      <div className="text-xs text-gray-500 truncate">{label}</div>
      <div className="space-y-0.5">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={afterVal === '1'}
            onChange={e => onChange(e.target.checked ? '1' : '')}
            disabled={readOnly}
            className="accent-blue-600 disabled:cursor-not-allowed"
          />
          <span className={afterVal === '1' ? 'font-medium' : 'text-gray-400'}>
            {afterVal === '1' ? 'あり' : 'なし'}
          </span>
        </label>
        {issues.map((issue, i) => (
          <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
            {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
          </div>
        ))}
      </div>
      <div className="text-xs bg-gray-50 rounded px-2 py-1 min-h-[26px] flex items-center">
        <label className="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-not-allowed">
          <input
            type="checkbox"
            checked={prevVal === '1'}
            disabled
            readOnly
            className="accent-blue-600"
          />
          <span>{prevVal === '1' ? 'あり' : 'なし'}</span>
        </label>
      </div>
    </div>
  )
}
