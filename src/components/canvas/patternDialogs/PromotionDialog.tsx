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

const FIELDS: Array<{ key: keyof AllocationRow; prevKey: keyof AllocationRow; label: string }> = [
  { key: 'officialPositionCode', prevKey: 'prevOfficialPositionCode', label: '役職' },
  { key: 'localJobTitle',        prevKey: 'prevLocalJobTitle',        label: 'フリータイトル' },
  { key: 'positionBand',         prevKey: 'prevPositionBand',         label: 'ポジションバンド' },
  { key: 'band',                 prevKey: 'prevBand',                 label: 'バンド' },
  { key: 'payGrade',             prevKey: 'prevPayGrade',             label: '給与等級' },
]

const FIELD_KEYS = new Set(FIELDS.map(f => f.key as string))

export function PromotionDialog({ rowId, onClose }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()
  const row = allocationList.find(r => r.rowId === rowId)

  const [buffer, setBuffer] = useState<Partial<Record<string, string>>>({})

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

  const handleSave = () => {
    if (Object.keys(buffer).length === 0) { onClose(); return }
    appService.executePromotion(rowId, buffer)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700">昇降格</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[row.lastName, row.firstName].filter(Boolean).join(' ')}
          </p>
        </div>

        <div className="grid grid-cols-[6rem_1fr_1fr] gap-x-2 px-4 py-1 bg-gray-50 border-b border-gray-100">
          <div className="text-[10px] text-gray-400">フィールド</div>
          <div className="text-[10px] text-blue-500">発令後</div>
          <div className="text-[10px] text-gray-400">発令前</div>
        </div>

        <div className="px-4 py-2 space-y-0.5 max-h-72 overflow-y-auto">
          {FIELDS.map(({ key, prevKey, label }) => {
            const afterVal    = get(key as string)
            const prevVal     = (row[prevKey] as string | undefined) ?? ''
            const fieldIssues = issues.filter(i => i.field === key)
            const hasError    = fieldIssues.some(i => i.level === 'error')
            const hasWarning  = fieldIssues.some(i => i.level === 'warning')
            const options     = getFieldOptions(key as string, effectiveRow, codeLists, get('jobFamily'))

            return (
              <div key={key as string}>
                <div className={`grid grid-cols-[6rem_1fr_1fr] gap-x-2 items-start py-1 rounded ${
                  hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : afterVal !== prevVal ? 'bg-blue-50' : ''
                }`}>
                  <div className="text-xs text-gray-500 truncate pt-0.5">{label}</div>
                  <div className="space-y-0.5">
                    <ComboInput
                      value={afterVal}
                      onChange={v => setBuffer(prev => ({ ...prev, [key as string]: v }))}
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
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >保存</button>
        </div>
      </div>
    </div>
  )
}
