import { useState, useMemo } from 'react'
import { PositionPickerModal }   from '../common/PositionPickerModal'
import { ConfirmOverwriteDialog } from './ConfirmOverwriteDialog'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { ValidationIssue } from '@personnel/domain/validation/validateRow'

interface Props {
  label:               string
  value:               string   // 現在のポジションコード
  prevVal:             string
  associatedName:      string   // 現在の managerName
  afterOrganizations:  Organization[]
  allRows:             AllocationRow[]
  issues:              ValidationIssue[]
  readOnly:            boolean
  onChange:            (posCode: string, managerName?: string) => void
}

export function ManagerPositionRow({ label, value, prevVal, associatedName, afterOrganizations, allRows, issues, readOnly, onChange }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [pending, setPending]       = useState<{ posCode: string; managerName: string } | null>(null)

  // 現在の上司ポジションの所属組織を初期選択にする
  const initialOrgId = useMemo(() => {
    if (!value) return undefined
    const managerRow = allRows.find(r => r.positionCode === value)
    if (!managerRow?.departmentCode) return undefined
    return afterOrganizations.find(o => o.externalCode === managerRow.departmentCode)?.id
  }, [value, allRows, afterOrganizations])

  const hasError   = issues.some(i => i.level === 'error')
  const hasWarning = issues.some(i => i.level === 'warning')
  const hasDiff    = value !== prevVal
  const rowBg      = hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : hasDiff ? 'bg-blue-50' : ''
  const borderCls  = hasError ? 'border-red-400 focus:ring-red-300'
    : hasWarning    ? 'border-orange-400 focus:ring-orange-300'
    : 'border-gray-300 focus:ring-blue-300'

  const handleSelect = (posCode: string, managerName: string) => {
    setSearchOpen(false)
    if (value || associatedName) {
      setPending({ posCode, managerName })
    } else {
      onChange(posCode, managerName)
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
              value={value}
              onChange={e => onChange(e.target.value)}
              disabled={readOnly}
              placeholder="コードを入力…"
              className={`flex-1 min-w-0 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${borderCls}`}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="上司を検索"
                className="flex-shrink-0 px-1.5 py-1 border border-gray-300 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </button>
            )}
          </div>
          {associatedName && (
            <div className="text-[10px] text-gray-400 px-1">{associatedName}</div>
          )}
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
        <PositionPickerModal
          allocationList={allRows}
          afterOrganizations={afterOrganizations}
          initialOrgId={initialOrgId}
          occupiedOnly={true}
          onSelect={handleSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {pending && (
        <ConfirmOverwriteDialog
          message="すでに入力済みの上司情報があります。上書きしますか？"
          okLabel="OK（ポジションコード・上司名を反映）"
          okCodeLabel="OK（コードのみ反映）"
          onOk={() => {
            onChange(pending.posCode, pending.managerName)
            setPending(null)
          }}
          onOkCodeOnly={() => {
            onChange(pending.posCode)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}
