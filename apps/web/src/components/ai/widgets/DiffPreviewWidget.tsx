import { useState } from 'react'
import type { PersonDiff, FormInput } from '../../../application/aiTypes'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  persons: PersonDiff[]
  label?: string
  formInputs?: FormInput[]
  isActive: boolean
  onConfirm: (userInputs?: Record<string, string>) => void
  onCancel: () => void
}

export function DiffPreviewWidget({ persons, label, formInputs, isActive, onConfirm, onCancel }: Props) {
  const [localInputs, setLocalInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries((formInputs ?? []).map(f => [f.field, f.value ?? '']))
  )

  const showOrgColumn = persons.some(d => d.before.orgName !== d.after.orgName && (d.before.orgName || d.after.orgName))
  const hasRequired   = (formInputs ?? []).some(f => f.required && !f.readOnly)
  const canSubmit     = !hasRequired || (formInputs ?? []).every(f => !f.required || f.readOnly || !!localInputs[f.field])

  const handleConfirm = () => {
    if (!canSubmit) return
    onConfirm(formInputs ? localInputs : undefined)
  }

  return (
    <div className="mt-2 border border-amber-200 rounded-xl overflow-hidden">
      {label && (
        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-amber-700">{label}</div>
      )}

      {persons.length > 0 && (
        <div className="px-3 py-2 max-h-56 overflow-y-auto">
          <DiffTable diffs={persons} showOrgColumn={showOrgColumn} />
        </div>
      )}

      {formInputs && formInputs.length > 0 && (
        <div className="border-t border-amber-100 px-3 py-2 space-y-2 bg-amber-50/40">
          {formInputs.map(f => (
            <FormField
              key={f.field}
              input={f}
              value={localInputs[f.field] ?? ''}
              onChange={v => setLocalInputs(prev => ({ ...prev, [f.field]: v }))}
            />
          ))}
        </div>
      )}

      {isActive && (
        <div className="bg-amber-50 px-3 py-2.5 flex gap-2 border-t border-amber-100">
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            確認して適用
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}

function FormField({ input, value, onChange }: { input: FormInput; value: string; onChange: (v: string) => void }) {
  const hasOverwrite = !!input.prevValue && input.prevValue !== value && !input.readOnly

  if (input.readOnly) {
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-0.5">{input.label}</label>
        <div className="text-xs bg-gray-100 border border-gray-200 rounded px-2 py-1.5 text-gray-500 select-none">
          {value || '（空）'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-700 block mb-0.5">
        {input.label}
        {input.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {input.options && input.options.length > 0 ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 ${
            input.required && !value ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          <option value="">（選択してください）</option>
          {input.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 ${
            input.required && !value ? 'border-red-300' : 'border-gray-300'
          }`}
        />
      )}
      {hasOverwrite && (
        <p className="text-[10px] text-orange-500 mt-0.5">⚠ 変更前: <span className="font-medium">{input.prevValue}</span></p>
      )}
      {input.prevValue && !hasOverwrite && value && value !== input.prevValue && (
        <p className="text-[10px] text-gray-400 mt-0.5">変更前: {input.prevValue}</p>
      )}
    </div>
  )
}
