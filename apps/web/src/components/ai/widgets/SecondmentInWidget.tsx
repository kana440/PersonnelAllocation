import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'

interface Props {
  rowId: number
  sfIntegrated: boolean
  label?: string
  isActive: boolean
  onConfirm: (userInputs: Record<string, string>) => void
  onCancel: () => void
}

export function SecondmentInWidget({ rowId, sfIntegrated, label, isActive, onConfirm, onCancel }: Props) {
  const { allocationList, codeLists } = useStore()
  const row = useMemo(() => allocationList.find(r => r.rowId === rowId), [allocationList, rowId])

  const [secondmentFromCompany,        setSecondmentFromCompany]        = useState('')
  const [secondmentFromEmployeeNumber, setSecondmentFromEmployeeNumber] = useState('')
  const [departmentCode,               setDepartmentCode]               = useState('')
  const [employmentType,               setEmploymentType]               = useState('')

  const employmentTypeOptions = useMemo(() => {
    return codeLists.employmentTypes
      ?.filter((e: { label: string; isSecondmentAcceptance?: boolean }) => e.isSecondmentAcceptance)
      .map((e: { label: string }) => e.label) ?? []
  }, [codeLists])

  if (!row) return <div className="text-xs text-red-500 px-3 py-2">行が見つかりません (rowId: {rowId})</div>

  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${rowId}`
  const canSubmit = !!secondmentFromCompany && (!sfIntegrated || !!secondmentFromEmployeeNumber) && !!departmentCode && !!employmentType

  const handleConfirm = () => {
    if (!canSubmit) return
    const inputs: Record<string, string> = {
      secondmentFromCompany,
      departmentCode,
      employmentType,
    }
    if (secondmentFromEmployeeNumber) inputs.secondmentFromEmployeeNumber = secondmentFromEmployeeNumber
    onConfirm(inputs)
  }

  return (
    <div className="mt-2 border border-purple-200 rounded-xl overflow-hidden">
      <div className="px-3 pt-2 pb-1.5 bg-purple-50 border-b border-purple-100">
        <span className="text-xs font-semibold text-purple-700">{label ?? '本務出向受入の確認'}</span>
        <span className="ml-2 text-xs text-purple-600">{name}</span>
        <span className="ml-1 text-xs text-purple-400">{sfIntegrated ? '（SF統合）' : '（SF非統合）'}</span>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* 出向元会社 */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            出向元会社 <span className="text-red-400">*</span>
          </label>
          <input type="text" value={secondmentFromCompany}
            onChange={e => setSecondmentFromCompany(e.target.value)}
            placeholder="例: 株式会社XX"
            className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
              !secondmentFromCompany ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        </div>

        {/* 出向元社員番号 */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            出向元社員番号{sfIntegrated ? <span className="text-red-400"> *</span> : <span className="text-gray-400">（任意）</span>}
          </label>
          <input type="text" value={secondmentFromEmployeeNumber}
            onChange={e => setSecondmentFromEmployeeNumber(e.target.value)}
            placeholder="例: E12345"
            className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
              sfIntegrated && !secondmentFromEmployeeNumber ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        </div>

        {/* 受入先組織コード */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            受入先組織コード <span className="text-red-400">*</span>
          </label>
          <input type="text" value={departmentCode}
            onChange={e => setDepartmentCode(e.target.value)}
            placeholder="組織コードを入力"
            className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
              !departmentCode ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        </div>

        {/* 雇用タイプ */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            雇用タイプ <span className="text-red-400">*</span>
          </label>
          {employmentTypeOptions.length > 0 ? (
            <select value={employmentType}
              onChange={e => setEmploymentType(e.target.value)}
              className={`w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                !employmentType ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">（選択してください）</option>
              {employmentTypeOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input type="text" value={employmentType}
              onChange={e => setEmploymentType(e.target.value)}
              placeholder="雇用タイプを入力"
              className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                !employmentType ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          )}
        </div>
      </div>

      {isActive && (
        <div className="bg-purple-50 px-3 py-2.5 flex gap-2 border-t border-purple-100">
          <button onClick={handleConfirm} disabled={!canSubmit}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
            確認して適用
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}
