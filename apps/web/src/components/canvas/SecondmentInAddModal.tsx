import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { getGroupedFieldOptions } from '@personnel/domain/choices'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface SecondmentInValues {
  userId?:                       string
  employeeNumber?:               string
  lastName?:                     string
  firstName?:                    string
  secondmentFromCompany:         string
  secondmentFromEmployeeNumber?: string
  employmentType?:               string
  concurrentType?:               '兼務'
  concurrentReason?:             string
}

interface Props {
  orgCode:      string
  orgName:      string
  sfIntegrated: boolean
  concurrent:   boolean
  onConfirm:    (values: SecondmentInValues) => void
  onClose:      () => void
}

export function SecondmentInAddModal({ orgCode: _orgCode, orgName, sfIntegrated, concurrent, onConfirm, onClose }: Props) {
  const { codeLists } = useStore()

  const [form, setForm] = useState<Partial<SecondmentInValues>>({
    concurrentType: concurrent ? '兼務' : undefined,
  })

  const set = (field: keyof SecondmentInValues, value: string) =>
    setForm(prev => ({ ...prev, [field]: value || undefined }))

  const title = `${concurrent ? '兼務' : '本務'}出向受入登録（SF${sfIntegrated ? '導入' : '未導入'}会社）`

  const canSubmit =
    !!form.secondmentFromCompany &&
    !!form.lastName &&
    !!form.firstName &&
    (!sfIntegrated || (!!form.userId && !!form.secondmentFromEmployeeNumber)) &&
    !!form.employmentType

  const handleSubmit = () => {
    if (!canSubmit) return
    onConfirm(form as SecondmentInValues)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400'
  const labelCls = 'text-[10px] text-gray-500 mb-0.5'

  // FIELD_CONSTRAINTS の条件付き制約（secondmentFromCompany + concurrentType）を利用して絞り込む
  const simulatedRow = {
    secondmentFromCompany: form.secondmentFromCompany ?? 'pending',
    concurrentType: form.concurrentType,
  } as AllocationRow
  const { valid: employmentTypes } = getGroupedFieldOptions('employmentType', simulatedRow, codeLists)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">

        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{orgName}</p>
        </div>

        <div className="px-4 py-3 space-y-2.5 max-h-[70vh] overflow-y-auto">

          {/* 出向元会社 */}
          <div>
            <div className={labelCls}>出向元会社 <span className="text-red-500">*</span></div>
            <input className={inputCls} value={form.secondmentFromCompany ?? ''} onChange={e => set('secondmentFromCompany', e.target.value)} placeholder="例: 株式会社〇〇" />
          </div>

          {/* 姓・名 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={labelCls}>姓 <span className="text-red-500">*</span></div>
              <input className={inputCls} value={form.lastName ?? ''} onChange={e => set('lastName', e.target.value)} placeholder="山田" />
            </div>
            <div>
              <div className={labelCls}>名 <span className="text-red-500">*</span></div>
              <input className={inputCls} value={form.firstName ?? ''} onChange={e => set('firstName', e.target.value)} placeholder="太郎" />
            </div>
          </div>

          {/* ユーザーID */}
          <div>
            <div className={labelCls}>
              ユーザーID（sfPersonId）{sfIntegrated ? <span className="text-red-500"> *</span> : ' （任意）'}
            </div>
            <input className={inputCls} value={form.userId ?? ''} onChange={e => set('userId', e.target.value)} placeholder="例: 00001234" />
          </div>

          {/* 社員番号 */}
          <div>
            <div className={labelCls}>
              出向元社員番号{sfIntegrated ? <span className="text-red-500"> *</span> : ' （任意）'}
            </div>
            <input className={inputCls} value={form.secondmentFromEmployeeNumber ?? ''} onChange={e => set('secondmentFromEmployeeNumber', e.target.value)} placeholder="例: EMP-0001" />
          </div>

          {/* 雇用タイプ（本務・兼務ともに必須） */}
          <div>
            <div className={labelCls}>雇用タイプ <span className="text-red-500">*</span></div>
            <select className={inputCls} value={form.employmentType ?? ''} onChange={e => set('employmentType', e.target.value)}>
              <option value="">選択してください</option>
              {employmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 兼務理由（兼務のみ・任意） */}
          {concurrent && (
            <div>
              <div className={labelCls}>兼務理由 （任意）</div>
              <input className={inputCls} value={form.concurrentReason ?? ''} onChange={e => set('concurrentReason', e.target.value)} />
            </div>
          )}

        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">キャンセル</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`text-xs px-4 py-1.5 rounded transition-colors ${canSubmit ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >登録</button>
        </div>

      </div>
    </div>
  )
}
