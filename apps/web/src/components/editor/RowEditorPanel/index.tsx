import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { deriveFieldUpdates, deriveManagerName, deriveOrgSubFields } from '@personnel/domain/derivation'
import { AutoDeriveDialog } from '../AutoDeriveDialog'
import { MetaSection } from './MetaSection'
import { FieldList } from './FieldList'
import { getOptions } from './helpers'
import type { AllocationRow, AfterValues } from '@personnel/domain/allocationRow'
import { FIELD_DISPLAY_LABELS } from '@personnel/domain/csvImport/allocationList/labels'

export function RowEditorPanel({ readOnly = false }: { readOnly?: boolean }) {
  const {
    allocationList, selectedRowId, saveRow,
    afterOrganizations, masters,
  } = useStore()

  const [buffer,       setBuffer]       = useState<Partial<Record<string, string>>>({})
  const [isDirty,      setIsDirty]      = useState(false)
  const [pendingDerive, setPendingDerive] = useState<{ updates: Record<string, string> } | null>(null)

  const row = allocationList.find(r => r.rowId === selectedRowId)

  useEffect(() => {
    setBuffer({})
    setIsDirty(false)
    setPendingDerive(null)
  }, [selectedRowId])

  const effectiveRow = useMemo(
    () => (row ? ({ ...row, ...buffer } as AllocationRow) : null),
    [row, buffer]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow({ row: effectiveRow, afterOrganizations, masters, allocationList })
  }, [effectiveRow, afterOrganizations, masters, allocationList])

  if (!selectedRowId || !row || !effectiveRow) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        行を選択すると編集できます
      </div>
    )
  }

  const handleChange = (key: keyof AllocationRow, value: string) => {
    const changes = { [key as string]: value } as Partial<Record<keyof AllocationRow, string>>
    const derived = deriveFieldUpdates(changes, effectiveRow, masters)
    setBuffer(prev => ({ ...prev, ...changes, ...derived }))
    setIsDirty(true)
  }

  const handleManagerPositionChange = (posCode: string, managerName?: string) => {
    const updates: Record<string, string> = { managerPositionCode: posCode }
    if (managerName !== undefined) updates.managerName = managerName
    setBuffer(prev => ({ ...prev, ...updates }))
    setIsDirty(true)
  }

  // 自動補完：導出値を計算して確認ダイアログを表示
  const handleAutoDerive = () => {
    const updates: Record<string, string> = {}

    const managerPosCode = (effectiveRow.managerPositionCode as string | undefined) ?? ''
    const derivedName = deriveManagerName(managerPosCode, allocationList)
    if (derivedName) updates.managerName = derivedName

    const deptCode = (effectiveRow.departmentCode as string | undefined) ?? ''
    const orgFields = deriveOrgSubFields(deptCode, masters)
    if (orgFields) Object.assign(updates, orgFields)

    const jobType = (effectiveRow.jobType as string | undefined) ?? ''
    const band    = (effectiveRow.band    as string | undefined) ?? ''
    if (jobType && band) {
      const pg = deriveFieldUpdates({ jobType, band } as Partial<Record<keyof AllocationRow, string>>, effectiveRow, masters)
      if (pg.payGrade) updates.payGrade = pg.payGrade
    }

    // 現在値と変わるフィールドのみ対象
    const changed = Object.fromEntries(
      Object.entries(updates).filter(([k, v]) =>
        v !== ((effectiveRow[k as keyof AllocationRow] as string | undefined) ?? '')
      )
    )
    if (Object.keys(changed).length > 0) {
      setPendingDerive({ updates: changed })
    }
  }

  const handleSave = () => {
    if (!isDirty) return
    saveRow(row.rowId, buffer as AfterValues)
    setBuffer({})
    setIsDirty(false)
  }

  const currentJobFamily = (effectiveRow.jobFamily as string | undefined) ?? ''

  const deriveChanges = pendingDerive
    ? Object.entries(pendingDerive.updates).map(([k, v]) => ({
        label:  FIELD_DISPLAY_LABELS[k] ?? k,
        before: (effectiveRow[k as keyof AllocationRow] as string | undefined) ?? '',
        after:  v,
      }))
    : []

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ヘッダーバー ── */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-700 truncate">
          {row.lastName}{row.firstName}
          <span className="ml-1.5 font-normal text-gray-400">({row.userId})</span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {!readOnly && (
            <button
              onClick={handleAutoDerive}
              title="上司氏名・組織サブフィールド・給与等級を現在値から再導出します"
              className="text-xs px-2 py-0.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-100 transition-colors"
            >
              自動補完
            </button>
          )}
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

      {/* ── 管理項目 ── */}
      <MetaSection
        effectiveRow={effectiveRow}
        issues={issues}
        readOnly={readOnly}
        transferReasonOptions={getOptions('transferReason', masters, currentJobFamily, effectiveRow).valid}
        demotionReasonOptions={getOptions('demotionReason', masters, currentJobFamily, effectiveRow).valid}
        onChange={handleChange}
      />

      {/* ── ポジション・職務情報 セクションヘッダー + カラム ── */}
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
        masters={masters}
        readOnly={readOnly}
        currentJobFamily={currentJobFamily}
        onChange={handleChange}
        onManagerChange={handleManagerPositionChange}
        onOrgChange={(_key, _code, batch) => {
          setBuffer(prev => ({ ...prev, ...batch }))
          setIsDirty(true)
        }}
      />

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
