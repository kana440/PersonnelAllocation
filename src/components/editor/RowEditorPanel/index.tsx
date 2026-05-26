import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { validateRow, fieldsToShow } from '../../../domain/validation/validateRow'
import { MetaSection } from './MetaSection'
import { FieldList } from './FieldList'
import { getOptions, derivePayGrade } from './helpers'
import type { AllocationRow, AfterValues } from '../../../domain/allocationRow'

export function RowEditorPanel({ readOnly = false }: { readOnly?: boolean }) {
  const {
    allocationList, selectedRowId, saveRow,
    afterOrganizations, codeLists,
  } = useStore()

  const [showAll, setShowAll] = useState(true)
  const [buffer,  setBuffer]  = useState<Partial<Record<string, string>>>({})
  const [isDirty, setIsDirty] = useState(false)

  const row = allocationList.find(r => r.rowId === selectedRowId)

  useEffect(() => {
    setBuffer({})
    setIsDirty(false)
  }, [selectedRowId])

  const effectiveRow = useMemo(
    () => (row ? ({ ...row, ...buffer } as AllocationRow) : null),
    [row, buffer]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow(effectiveRow, afterOrganizations, codeLists, undefined, allocationList)
  }, [effectiveRow, afterOrganizations, codeLists, allocationList])

  const defaultFields = useMemo(() => {
    if (!effectiveRow) return new Set<string>()
    return fieldsToShow(effectiveRow, issues) as Set<string>
  }, [effectiveRow, issues])

  if (!selectedRowId || !row || !effectiveRow) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        行を選択すると編集できます
      </div>
    )
  }

  const handleChange = (key: keyof AllocationRow, value: string) => {
    const updates: Record<string, string> = { [key as string]: value }
    if (key === 'jobFamily') {
      updates.jobType  = ''
      updates.payGrade = ''
    } else if (key === 'jobType' || key === 'band') {
      const newJobType = key === 'jobType' ? value : ((effectiveRow.jobType as string | undefined) ?? '')
      const newBand    = key === 'band'    ? value : ((effectiveRow.band    as string | undefined) ?? '')
      const derived = derivePayGrade(newJobType, newBand, codeLists)
      if (derived) updates.payGrade = derived
    }
    setBuffer(prev => ({ ...prev, ...updates }))
    setIsDirty(true)
  }

  const handleManagerPositionChange = (posCode: string, managerName: string) => {
    setBuffer(prev => ({ ...prev, managerPositionCode: posCode, managerName }))
    setIsDirty(true)
  }

  const handleSave = () => {
    if (!isDirty) return
    saveRow(row.rowId, buffer as AfterValues)
    setBuffer({})
    setIsDirty(false)
  }

  const currentJobFamily = (effectiveRow.jobFamily as string | undefined) ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ヘッダー ── */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-700 truncate">
          {row.lastName}{row.firstName}
          <span className="ml-1.5 font-normal text-gray-400">({row.userId})</span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs px-2 py-0.5 border rounded transition-colors ${
              !showAll
                ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                : 'text-gray-400 border-gray-200 hover:bg-gray-50'
            }`}
          >
            変更のみ
          </button>
          {readOnly ? (
            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 font-medium">
              照会のみ
            </span>
          ) : (
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="text-xs px-3 py-1 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isDirty ? '● 保存' : '保存済'}
            </button>
          )}
        </div>
      </div>

      {/* ── 個人情報（読み取り専用） ── */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-x-5 gap-y-1">
        {[
          { label: 'ユーザーID', value: row.userId ?? '' },
          { label: '社員番号',   value: row.employeeNumber ?? '' },
          { label: '姓',        value: row.lastName ?? '' },
          { label: '名',        value: row.firstName ?? '' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 w-14">{label}</span>
            <span className="text-gray-700 font-medium">{value || '—'}</span>
          </div>
        ))}
      </div>

      {/* ── 発令メタ情報 ── */}
      <MetaSection
        effectiveRow={effectiveRow}
        issues={issues}
        readOnly={readOnly}
        transferReasonOptions={getOptions('transferReason', codeLists, currentJobFamily)}
        demotionReasonOptions={getOptions('demotionReason', codeLists, currentJobFamily)}
        onChange={handleChange}
      />

      {/* ── カラムヘッダー ── */}
      <div className="flex-shrink-0 grid grid-cols-[8rem_1fr_1fr] gap-x-2 px-3 py-1 bg-gray-100 border-b border-gray-200">
        <div className="text-xs font-medium text-gray-500">フィールド</div>
        <div className="text-xs font-medium text-blue-600">新（発令後）</div>
        <div className="text-xs font-medium text-gray-400">旧（発令前）</div>
      </div>

      <FieldList
        effectiveRow={effectiveRow}
        savedRow={row}
        issues={issues}
        showAll={showAll}
        defaultFields={defaultFields}
        allocationList={allocationList}
        afterOrganizations={afterOrganizations}
        codeLists={codeLists}
        readOnly={readOnly}
        currentJobFamily={currentJobFamily}
        onChange={handleChange}
        onManagerChange={handleManagerPositionChange}
        onOrgChange={(_key, _code, batch) => {
          setBuffer(prev => ({ ...prev, ...batch }))
          setIsDirty(true)
        }}
      />
    </div>
  )
}
