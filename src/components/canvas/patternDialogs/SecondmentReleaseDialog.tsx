import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { ComboInput } from '../../common/ComboInput'
import { getFieldOptions } from '../../../domain/optionFilter'
import { validateRow } from '../../../domain/validation/validateRow'
import type { AllocationRow } from '../../../domain/allocationRow'

interface Props {
  rowId:   number
  onClose: () => void
}

const FIELD_KEYS = new Set(['employmentType', 'secondmentToCompany', 'secondmentFromCompany', 'transferReason'])

export function SecondmentReleaseDialog({ rowId, onClose }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()
  const row = allocationList.find(r => r.rowId === rowId)

  const defaultReason = useMemo(() => {
    const match = codeLists.transferReasons.find(e =>
      e.label.includes('出向解除') || e.label.includes('帰任')
    )
    return match?.label ?? '出向解除'
  }, [codeLists.transferReasons])

  // 発令前の雇用タイプを解除後のデフォルトに使わず、選択肢から選ばせる
  const [buffer, setBuffer] = useState<Partial<Record<string, string>>>({
    transferReason:       defaultReason,
    secondmentToCompany:  '',
    secondmentFromCompany: '',
  })

  const effectiveRow = useMemo(
    () => (row ? { ...row, ...buffer } as AllocationRow : null),
    [row, buffer]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow(effectiveRow, afterOrganizations, codeLists, undefined, allocationList)
      .filter(i => FIELD_KEYS.has(i.field as string))
  }, [effectiveRow, afterOrganizations, codeLists, allocationList])

  if (!row || !effectiveRow) return null

  const get = (key: string) =>
    (buffer[key] ?? (row[key as keyof AllocationRow] as string | undefined) ?? '')

  const rows: Array<{ key: string; label: string; prevKey: keyof AllocationRow; readOnly?: boolean }> = [
    { key: 'employmentType',        label: '雇用タイプ（解除後）',  prevKey: 'prevEmploymentType' },
    { key: 'secondmentToCompany',   label: '出向先（クリア）',       prevKey: 'prevSecondmentToCompany',   readOnly: false },
    { key: 'secondmentFromCompany', label: '受入出向元（クリア）',   prevKey: 'prevSecondmentFromCompany', readOnly: false },
    { key: 'transferReason',        label: '異動事由',               prevKey: 'prevEmploymentType' },
  ]

  const handleSave = () => {
    appService.executeSecondmentRelease(rowId, buffer)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700">出向解除</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[row.lastName, row.firstName].filter(Boolean).join(' ')}
            <span className="ml-2 text-amber-600">
              発令前雇用タイプ: {(row.prevEmploymentType as string | undefined) ?? '―'}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-[7rem_1fr_1fr] gap-x-2 px-4 py-1 bg-gray-50 border-b border-gray-100">
          <div className="text-[10px] text-gray-400">フィールド</div>
          <div className="text-[10px] text-blue-500">発令後</div>
          <div className="text-[10px] text-gray-400">発令前</div>
        </div>

        <div className="px-4 py-2 space-y-0.5 max-h-64 overflow-y-auto">
          {rows.map(({ key, label, prevKey }) => {
            const afterVal    = get(key)
            const prevVal     = (row[prevKey] as string | undefined) ?? ''
            const fieldIssues = issues.filter(i => i.field as string === key)
            const hasError    = fieldIssues.some(i => i.level === 'error')
            const hasWarning  = fieldIssues.some(i => i.level === 'warning')
            const options     = getFieldOptions(key, effectiveRow, codeLists)

            return (
              <div key={key}>
                <div className={`grid grid-cols-[7rem_1fr_1fr] gap-x-2 items-start py-1 rounded ${
                  hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : afterVal !== prevVal ? 'bg-blue-50' : ''
                }`}>
                  <div className="text-xs text-gray-500 truncate pt-0.5">{label}</div>
                  <div className="space-y-0.5">
                    <ComboInput
                      value={afterVal}
                      onChange={v => setBuffer(prev => ({ ...prev, [key]: v }))}
                      options={options}
                      hasIssue={hasError || hasWarning}
                    />
                    {fieldIssues.map((issue, i) => (
                      <div key={i} className={`text-[10px] ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                        {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px]">
                    {prevVal || <span className="text-gray-300">—</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button
            onClick={handleSave}
            className="text-xs px-4 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >保存</button>
        </div>
      </div>
    </div>
  )
}
