import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { deriveFieldUpdates } from '../../../domain/derivation'
import { validateRow } from '../../../domain/validation/validateRow'
import { getGroupedFieldOptions } from '../../../domain/optionFilter'
import { resolveFieldStrictness } from '../../../domain/optionStrictness'
import { ALLOCATION_LIST_LABEL_MAP } from '../../../domain/csvImport/allocationList/labels'
import { ComboInput } from '../../common/ComboInput'
import type { OperationDef } from '../../../domain/operationDefs'
import type { AllocationRow } from '../../../domain/allocationRow'
import { OrgSearchDialog } from '../OrgSearchDialog'

// 組織ピッカーを使うフィールド（ComboInput の代わりに検索ボタン付き）
const ORG_PICKER_FIELDS = new Set(['departmentCode', 'managerPositionCode'])

interface Props {
  def:    OperationDef
  row:    AllocationRow
  onBack: () => void
}

export function OperationFormView({ def, row, onBack }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()

  const ctx = useMemo(
    () => ({ allocationList, afterOrganizations, codeLists }),
    [allocationList, afterOrganizations, codeLists]
  )
  const initialValues = useMemo(() => def.deriveInitial(row, ctx), [def, row, ctx])

  const [values,      setValues]      = useState<Partial<AllocationRow>>(() => ({ ...initialValues }))
  const [orgPickerField, setOrgPickerField] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const draftRow = useMemo(() => ({ ...row, ...values } as AllocationRow), [row, values])

  // フィールド変更 + auto-derive
  const handleChange = (field: keyof AllocationRow, value: string) => {
    const changes = { [field]: value } as Partial<AllocationRow>
    const derived = deriveFieldUpdates(changes, draftRow, codeLists, allocationList)
    setValues(prev => ({ ...prev, ...changes, ...derived }))
  }

  // バリデーション（リアルタイム）
  const issues = useMemo(
    () => validateRow(draftRow, afterOrganizations, codeLists, undefined, allocationList)
      .filter(i => def.inputs.some(inp => inp.field === i.field)),
    [draftRow, afterOrganizations, codeLists, allocationList, def.inputs]
  )

  // 実行
  const handleSubmit = () => {
    setSubmitError(null)
    try {
      const command = def.createCommand(row.rowId, values)
      const result  = appService.executeOperation(command)
      if (!result.ok) {
        setSubmitError(result.errors.map(e => e.message).join(' / '))
        return
      }
      onBack()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '操作の実行に失敗しました')
    }
  }

  const hasBlockingError = issues.some(i => i.level === 'error') || !!submitError
  const currentJobFamily = (values.jobFamily ?? row.jobFamily) as string | undefined

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ヘッダー */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1"
          title="戻る"
        >←</button>
        <span className="text-xs font-semibold text-gray-700">{def.label}</span>
      </div>

      {/* フォーム */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {def.inputs.map(({ field, required, label }) => {
          const fieldKey    = field as string
          const fieldLabel  = label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey
          const currentVal  = (values[field] as string | undefined) ?? ''
          const prevKey     = `prev${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
          const prevVal     = (row[prevKey as keyof AllocationRow] as string | undefined) ?? ''
          const fieldIssues = issues.filter(i => i.field === fieldKey)
          const hasIssue    = fieldIssues.some(i => i.level === 'error' || i.level === 'warning')

          // 組織ピッカー
          if (ORG_PICKER_FIELDS.has(fieldKey)) {
            const orgName = afterOrganizations.find(
              o => o.externalCode === currentVal || o.id === currentVal
            )?.name ?? ''
            return (
              <div key={fieldKey}>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <div className="flex gap-1.5">
                  <ComboInput
                    value={currentVal}
                    onChange={v => handleChange(field, v)}
                    options={[]}
                    hasIssue={hasIssue}
                  />
                  <button
                    onClick={() => setOrgPickerField(fieldKey)}
                    className="px-2.5 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                    title="組織を検索"
                  >🔍</button>
                </div>
                {orgName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{orgName}</p>}
                {prevVal && <p className="text-[10px] text-gray-400 mt-0.5">現在: {prevVal}</p>}
                {fieldIssues.map((issue, i) => (
                  <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                    {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                  </p>
                ))}
              </div>
            )
          }

          // VALUE_RULES から選択肢を取得（suggestion / constraint どちらも ComboInput で自由入力可）
          const { valid, invalid } = getGroupedFieldOptions(fieldKey, draftRow, codeLists, currentJobFamily)
          const strictness = resolveFieldStrictness(fieldKey, {})

          return (
            <div key={fieldKey}>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <ComboInput
                value={currentVal}
                onChange={v => handleChange(field, v)}
                options={valid}
                invalidOptions={invalid}
                strictness={strictness}
                hasIssue={hasIssue}
              />
              {prevVal && <p className="text-[10px] text-gray-400 mt-0.5">現在: {prevVal}</p>}
              {fieldIssues.map((issue, i) => (
                <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                  {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                </p>
              ))}
            </div>
          )
        })}

        {submitError && (
          <div className="text-[11px] text-red-600 bg-red-50 rounded px-2.5 py-1.5">{submitError}</div>
        )}
      </div>

      {/* 実行・キャンセル */}
      <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >キャンセル</button>
        <button
          onClick={handleSubmit}
          disabled={hasBlockingError}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >実行</button>
      </div>

      {/* 組織ピッカー */}
      {orgPickerField && (
        <OrgSearchDialog
          afterOrganizations={afterOrganizations}
          orgMasterEntries={codeLists.orgMasterEntries}
          onSelect={(code) => {
            handleChange(orgPickerField as keyof AllocationRow, code)
            setOrgPickerField(null)
          }}
          onClose={() => setOrgPickerField(null)}
        />
      )}
    </div>
  )
}
