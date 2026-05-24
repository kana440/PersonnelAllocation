import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { BEFORE_AFTER_FIELD_PAIRS } from '../../domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '../../domain/csvImport/allocationList/labels'
import { validateRow, fieldsToShow, issuesForField } from '../../domain/validation/validateRow'
import { RowEditorField } from './RowEditorField'
import { ComboInput } from '../common/ComboInput'
import type { AllocationRow } from '../../domain/allocationRow'
import type { AfterValues } from '../../domain/allocationRow'

const FIELD_LABEL = Object.fromEntries(
  BEFORE_AFTER_FIELD_PAIRS.map(([afterKey, prevKey]) => [
    String(afterKey),
    ALLOCATION_LIST_LABEL_MAP[String(prevKey)]?.ja ?? String(afterKey),
  ])
)

const CODE_LIST_KEYS: Partial<Record<string, string>> = {
  employmentType: 'employmentTypes',
  concurrentType: 'concurrentTypes',
  transferReason: 'transferReasons',
  jobFamily:      'jobFamilies',
  jobType:        'jobTypes',
}

const READONLY_FIELDS = new Set<string>([
  'userId', 'employeeNumber', 'lastName', 'firstName',
  'groupEmployeeId', 'groupEmployeeNumber',
])

export function RowEditorPanel({ readOnly = false }: { readOnly?: boolean }) {
  const {
    allocationList, selectedRowId, saveRow,
    afterOrganizations, codeLists,
  } = useStore()

  const [showAll, setShowAll] = useState(false)
  const [buffer, setBuffer] = useState<Partial<Record<string, string>>>({})
  const [isDirty, setIsDirty] = useState(false)

  const row = allocationList.find(r => r.rowId === selectedRowId)

  // 行が切り替わったらバッファをリセット
  useEffect(() => {
    setBuffer({})
    setIsDirty(false)
  }, [selectedRowId])

  // バッファと保存済みデータをマージして表示用行を生成
  const effectiveRow = useMemo(
    () => (row ? ({ ...row, ...buffer } as AllocationRow) : null),
    [row, buffer]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow(effectiveRow, afterOrganizations, codeLists)
  }, [effectiveRow, afterOrganizations, codeLists])

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

  const getOptions = (key: string): string[] => {
    const listKey = CODE_LIST_KEYS[key]
    if (!listKey) return []
    const list = (codeLists as unknown as Record<string, unknown>)[listKey]
    if (Array.isArray(list)) return list.map((v: unknown) => String((v as Record<string, string>).value ?? v))
    return []
  }

  const handleChange = (key: keyof AllocationRow, value: string) => {
    setBuffer(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = () => {
    if (!isDirty) return
    saveRow(row.rowId, buffer as AfterValues)
    setBuffer({})
    setIsDirty(false)
  }

  const transferReasonOptions = getOptions('transferReason')

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
            className={`text-xs px-2 py-1 border rounded transition-colors ${
              showAll ? 'bg-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {showAll ? '差分のみ' : '全件表示'}
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

      {/* ── メタ情報セクション（異動事由・メモ等） ── */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
          発令メタ情報
        </div>
        <div className="px-3 py-2 space-y-1.5">
          {/* 異動事由（コンボボックス） */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-16 flex-shrink-0">異動事由</label>
            <div className="flex-1">
              <ComboInput
                value={(effectiveRow.transferReason as string | undefined) ?? ''}
                onChange={v => handleChange('transferReason', v)}
                options={transferReasonOptions}
                disabled={readOnly}
                hasIssue={issues.some(i => i.field === 'transferReason')}
              />
            </div>
          </div>
          {/* メモ */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-16 flex-shrink-0">メモ</label>
            <input
              type="text"
              value={(effectiveRow.memo as string | undefined) ?? ''}
              onChange={e => handleChange('memo', e.target.value)}
              disabled={readOnly}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>
          {/* 昇格・降格・給与等級変更（1行にまとめて） */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-500 w-16 flex-shrink-0">昇格サイン</label>
            <input
              type="text"
              value={(effectiveRow.promotionSign as string | undefined) ?? ''}
              onChange={e => handleChange('promotionSign', e.target.value)}
              disabled={readOnly}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <label className="text-xs text-gray-500 flex-shrink-0">降格事由</label>
            <input
              type="text"
              value={(effectiveRow.demotionReason as string | undefined) ?? ''}
              onChange={e => handleChange('demotionReason', e.target.value)}
              disabled={readOnly}
              className="w-28 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <label className="text-xs text-gray-500 flex-shrink-0">給与等級変更</label>
            <input
              type="text"
              value={(effectiveRow.payGradeChangeSign as string | undefined) ?? ''}
              onChange={e => handleChange('payGradeChangeSign', e.target.value)}
              disabled={readOnly}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>
          {/* メタフィールドのバリデーションメッセージ */}
          {issues
            .filter(i => ['transferReason', 'memo'].includes(String(i.field)))
            .map((issue, i) => (
              <div key={i} className={`text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
              </div>
            ))}
        </div>
      </div>

      {/* ── カラムヘッダー ── */}
      <div className="flex-shrink-0 grid grid-cols-[8rem_1fr_1fr] gap-x-2 px-3 py-1 bg-gray-100 border-b border-gray-200">
        <div className="text-xs font-medium text-gray-500">フィールド</div>
        <div className="text-xs font-medium text-blue-600">新（発令後）</div>
        <div className="text-xs font-medium text-gray-400">旧（発令前）</div>
      </div>

      {/* ── フィールド一覧 ── */}
      <div className="flex-1 overflow-y-auto">
        {BEFORE_AFTER_FIELD_PAIRS.map(([afterKey, prevKey]) => {
          const afterStr = (effectiveRow[afterKey] as string | undefined) ?? ''
          const prevStr  = (row[prevKey]  as string | undefined) ?? ''
          const key      = String(afterKey)

          if (!showAll && !defaultFields.has(key)) return null

          return (
            <RowEditorField
              key={key}
              label={FIELD_LABEL[key] ?? key}
              afterVal={afterStr}
              beforeVal={prevStr}
              onChange={v => handleChange(afterKey, v)}
              options={getOptions(key)}
              issues={issuesForField(issues, afterKey)}
              readOnly={READONLY_FIELDS.has(key) || readOnly}
            />
          )
        })}

        {issues.length === 0 && !showAll && defaultFields.size === 0 && (
          <div className="text-xs text-gray-400 text-center py-8">
            発令前後の差分がありません。「全件表示」で全フィールドを確認できます。
          </div>
        )}
      </div>
    </div>
  )
}
