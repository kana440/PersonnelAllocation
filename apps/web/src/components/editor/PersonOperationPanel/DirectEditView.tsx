import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { deriveFieldUpdates, deriveManagerName, deriveOrgSubFields } from '@personnel/domain/derivation'
import { AutoDeriveDialog } from '../AutoDeriveDialog'
import { MetaSection } from '../RowEditorPanel/MetaSection'
import { FieldList } from '../RowEditorPanel/FieldList'
import { getOptions } from '../RowEditorPanel/helpers'
import type { AllocationRow, AfterValues } from '@personnel/domain/allocationRow'
import { FIELD_DISPLAY_LABELS } from '@personnel/domain/csvImport/allocationList/labels'

interface Props {
  row:    AllocationRow
  onBack: () => void
}

export function DirectEditView({ row, onBack }: Props) {
  const { allocationList, saveRow, afterOrganizations, codeLists } = useStore()

  const [buffer,        setBuffer]        = useState<Partial<Record<string, string>>>({})
  const [isDirty,       setIsDirty]       = useState(false)
  const [pendingDerive, setPendingDerive] = useState<{ updates: Record<string, string> } | null>(null)

  useEffect(() => {
    setBuffer({})
    setIsDirty(false)
    setPendingDerive(null)
  }, [row.rowId])

  const effectiveRow = useMemo(
    () => ({ ...row, ...buffer } as AllocationRow),
    [row, buffer]
  )

  const issues = useMemo(
    () => validateRow({ row: effectiveRow, afterOrganizations, codeLists, allocationList }),
    [effectiveRow, afterOrganizations, codeLists, allocationList]
  )

  const handleChange = (key: keyof AllocationRow, value: string) => {
    const changes = { [key as string]: value } as Partial<Record<keyof AllocationRow, string>>
    const derived = deriveFieldUpdates(changes, effectiveRow, codeLists)
    setBuffer(prev => ({ ...prev, ...changes, ...derived }))
    setIsDirty(true)
  }

  const handleManagerPositionChange = (posCode: string, managerName?: string) => {
    const updates: Record<string, string> = { managerPositionCode: posCode }
    if (managerName !== undefined) updates.managerName = managerName
    setBuffer(prev => ({ ...prev, ...updates }))
    setIsDirty(true)
  }

  const handleAutoDerive = () => {
    const updates: Record<string, string> = {}

    const managerPosCode = (effectiveRow.managerPositionCode as string | undefined) ?? ''
    const derivedName = deriveManagerName(managerPosCode, allocationList)
    if (derivedName) updates.managerName = derivedName

    const deptCode = (effectiveRow.departmentCode as string | undefined) ?? ''
    const orgFields = deriveOrgSubFields(deptCode, codeLists)
    if (orgFields) Object.assign(updates, orgFields)

    const jobType = (effectiveRow.jobType as string | undefined) ?? ''
    const band    = (effectiveRow.band    as string | undefined) ?? ''
    if (jobType && band) {
      const pg = deriveFieldUpdates({ jobType, band } as Partial<Record<keyof AllocationRow, string>>, effectiveRow, codeLists)
      if (pg.payGrade) updates.payGrade = pg.payGrade
    }

    const changed = Object.fromEntries(
      Object.entries(updates).filter(([k, v]) =>
        v !== ((effectiveRow[k as keyof AllocationRow] as string | undefined) ?? '')
      )
    )
    if (Object.keys(changed).length > 0) setPendingDerive({ updates: changed })
  }

  const handleSave = () => {
    if (!isDirty) return
    saveRow(row.rowId, buffer as AfterValues)
    setBuffer({})
    setIsDirty(false)
  }

  const handleCancel = () => {
    setBuffer({})
    setIsDirty(false)
    onBack()
  }

  const currentJobFamily  = (effectiveRow.jobFamily as string | undefined) ?? ''
  const personName        = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'
  const employeeNumber    = (row.employeeNumber as string | undefined) ?? ''
  const promotionSign     = (row.promotionSign as string | undefined) ?? ''
  const payGradeChangeSign = (row.payGradeChangeSign as string | undefined) ?? ''

  const deriveChanges = pendingDerive
    ? Object.entries(pendingDerive.updates).map(([k, v]) => ({
        label:  FIELD_DISPLAY_LABELS[k] ?? k,
        before: (effectiveRow[k as keyof AllocationRow] as string | undefined) ?? '',
        after:  v,
      }))
    : []

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ヘッダー */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1"
            title="戻る"
          >←</button>
          <span className="text-xs font-semibold text-gray-700">直接編集</span>
          <div className="ml-auto">
            <button
              onClick={handleAutoDerive}
              title="上司氏名・組織サブフィールド・給与等級を現在値から再導出します"
              className="text-xs px-2 py-0.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-100 transition-colors"
            >
              自動補完
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5 ml-6 text-[11px] text-gray-500">
          <span className="font-medium text-gray-700">{personName}</span>
          {employeeNumber && <span className="text-gray-400">{employeeNumber}</span>}
          {promotionSign && (
            <span className="text-green-600 font-semibold">{promotionSign}</span>
          )}
          {payGradeChangeSign && (
            <span className="text-blue-600 font-semibold">{payGradeChangeSign}</span>
          )}
        </div>
      </div>

      {/* 管理項目 */}
      <MetaSection
        effectiveRow={effectiveRow}
        issues={issues}
        readOnly={false}
        transferReasonOptions={getOptions('transferReason', codeLists, currentJobFamily, effectiveRow).valid}
        demotionReasonOptions={getOptions('demotionReason', codeLists, currentJobFamily, effectiveRow).valid}
        onChange={handleChange}
      />

      {/* ポジション・職務情報 セクションヘッダー + カラム */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <div className="px-3 py-1 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500">ポジション・職務情報</span>
        </div>
        <div className="grid grid-cols-[8rem_1fr_1fr] gap-x-2 px-3 py-0.5 bg-gray-100">
          <div className="text-xs font-medium text-gray-400">フィールド</div>
          <div className="text-xs font-medium text-blue-600">新</div>
          <div className="text-xs font-medium text-gray-400">旧</div>
        </div>
      </div>

      <FieldList
        effectiveRow={effectiveRow}
        savedRow={row}
        issues={issues}
        allocationList={allocationList}
        afterOrganizations={afterOrganizations}
        codeLists={codeLists}
        readOnly={false}
        currentJobFamily={currentJobFamily}
        onChange={handleChange}
        onManagerChange={handleManagerPositionChange}
        onOrgChange={(_key, _code, batch) => {
          setBuffer(prev => ({ ...prev, ...batch }))
          setIsDirty(true)
        }}
      />

      {/* フッター */}
      <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
        <button
          onClick={handleCancel}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >
          {isDirty ? '変更を破棄して戻る' : 'キャンセル'}
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          保存
        </button>
      </div>

      {/* 自動補完確認ダイアログ */}
      {pendingDerive && (
        <AutoDeriveDialog
          changes={deriveChanges}
          onApply={() => {
            setBuffer(prev => ({ ...prev, ...pendingDerive.updates }))
            setIsDirty(true)
            setPendingDerive(null)
          }}
          onCancel={() => setPendingDerive(null)}
        />
      )}
    </div>
  )
}
