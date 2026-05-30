import { useState } from 'react'
import { OrgSearchDialog } from '../OrgSearchDialog'
import { ConfirmOverwriteDialog } from '../ConfirmOverwriteDialog'
import type { Organization } from '../../../domain/schemas'
import type { OrgMasterEntry } from '../../../domain/codeLists/orgMaster'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface RelatedValues {
  businessUnit?: string
  division?:     string
  subDivision?:  string
  group?:        string
  team?:         string
}

interface Props {
  label:              string
  code:               string
  prevVal:            string
  afterOrganizations: Organization[]
  orgMasterEntries:   OrgMasterEntry[]
  relatedValues:      RelatedValues
  issues:             ValidationIssue[]
  readOnly:           boolean
  onCodeChange:       (code: string) => void
  onBatchChange:      (batch: Record<string, string>) => void
}

function hasRelatedData(relatedValues: RelatedValues): boolean {
  return Object.values(relatedValues).some(v => !!v)
}

function buildBatch(key: string, entry: OrgMasterEntry): Record<string, string> {
  return {
    [key]:          entry.code,
    businessUnit:   entry.businessUnit,
    division:       entry.division,
    subDivision:    entry.department,
    group:          entry.group,
    team:           entry.team,
  }
}

export function OrgEditorRow({
  label, code, prevVal, afterOrganizations, orgMasterEntries, relatedValues, issues, readOnly,
  onCodeChange, onBatchChange,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [pending,    setPending]    = useState<OrgMasterEntry | null>(null)

  const hasError   = issues.some(i => i.level === 'error')
  const hasWarning = issues.some(i => i.level === 'warning')
  const hasDiff    = code !== prevVal
  const rowBg      = hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : hasDiff ? 'bg-blue-50' : ''
  const borderCls  = hasError ? 'border-red-400 focus:ring-red-300'
    : hasWarning    ? 'border-orange-400 focus:ring-orange-300'
    : 'border-gray-300 focus:ring-blue-300'

  const handleSelect = (selCode: string, entry: OrgMasterEntry | null) => {
    setSearchOpen(false)
    if (!entry) { onCodeChange(selCode); return }
    if (code || hasRelatedData(relatedValues)) {
      setPending(entry)
    } else {
      onBatchChange(buildBatch('departmentCode', entry))
    }
  }

  return (
    <>
      <div className={`grid grid-cols-[8rem_1fr_1fr] gap-x-2 items-start px-3 py-1.5 border-b border-gray-100 ${rowBg}`}>
        <div className="text-xs text-gray-500 leading-5 truncate pt-0.5">{label}</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={code}
              onChange={e => onCodeChange(e.target.value)}
              disabled={readOnly}
              placeholder="コードを入力…"
              className={`flex-1 min-w-0 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${borderCls}`}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="組織を検索"
                className="flex-shrink-0 px-1.5 py-1 border border-gray-300 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </button>
            )}
          </div>
          {issues.map((issue, i) => (
            <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
              {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px] break-all font-mono">
          {prevVal || <span className="text-gray-300">—</span>}
        </div>
      </div>

      {searchOpen && (
        <OrgSearchDialog
          afterOrganizations={afterOrganizations}
          orgMasterEntries={orgMasterEntries}
          onSelect={handleSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {pending && (
        <ConfirmOverwriteDialog
          message="すでに入力済みの組織情報があります。上書きしますか？"
          onOk={() => {
            onBatchChange(buildBatch('departmentCode', pending))
            setPending(null)
          }}
          onOkCodeOnly={() => {
            onCodeChange(pending.code)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}
