import { OrgCombobox } from '../../common/OrgCombobox'
import type { Organization } from '../../../domain/schemas'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  label:    string
  orgId:    string | null
  prevVal:  string
  orgs:     Organization[]
  issues:   ValidationIssue[]
  readOnly: boolean
  onChange: (id: string | null) => void
}

export function OrgEditorRow({ label, orgId, prevVal, orgs, issues, readOnly, onChange }: Props) {
  const hasError   = issues.some(i => i.level === 'error')
  const hasWarning = issues.some(i => i.level === 'warning')
  const rowBg      = hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : orgId ? 'bg-blue-50' : ''

  return (
    <div className={`grid grid-cols-[8rem_1fr_1fr] gap-x-2 items-start px-3 py-1.5 border-b border-gray-100 ${rowBg}`}>
      <div className="text-xs text-gray-500 leading-5 truncate pt-0.5">{label}</div>
      <div className="space-y-0.5">
        <OrgCombobox
          allOrgs={orgs}
          value={orgId}
          onChange={readOnly ? () => {} : onChange}
          variant="light"
          placeholder="組織を選択…"
        />
        {issues.map((issue, i) => (
          <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
            {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px] break-all">
        {prevVal || <span className="text-gray-300">—</span>}
      </div>
    </div>
  )
}
