import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { validateRow } from '../../../domain/validation/validateRow'
import type { AllocationRow } from '../../../domain/allocationRow'

interface Props {
  rowId:   number
  onClose: () => void
}

const FIELD_KEYS = new Set(['transferReason', 'memo'])

export function ResignationDialog({ rowId, onClose }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()
  const row = allocationList.find(r => r.rowId === rowId)

  const defaultReason = useMemo(() => {
    const match = codeLists.transferReasons.find(e =>
      e.label.includes('退職') || e.label.includes('退任')
    )
    return match?.label ?? '退職'
  }, [codeLists.transferReasons])

  const [memo, setMemo] = useState((row?.memo as string | undefined) ?? '')

  const effectiveRow = useMemo(
    () => (row ? { ...row, transferReason: defaultReason, memo } as AllocationRow : null),
    [row, defaultReason, memo]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow(effectiveRow, afterOrganizations, codeLists, undefined, allocationList)
      .filter(i => FIELD_KEYS.has(i.field as string))
  }, [effectiveRow, afterOrganizations, codeLists, allocationList])

  if (!row) return null

  const handleSave = () => {
    appService.executeResignation(rowId, defaultReason, memo)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700">退職を設定</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[row.lastName, row.firstName].filter(Boolean).join(' ')}
          </p>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">異動事由（自動設定）</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-500 bg-gray-50">
              {defaultReason}
            </div>
            {issues.filter(i => i.field === 'transferReason').map((issue, i) => (
              <div key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">メモ</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
              placeholder="退職に関する補足情報（任意）"
            />
            {issues.filter(i => i.field === 'memo').map((issue, i) => (
              <div key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            ※ userId・組織コードなどは変更されません。「保存」を押すまで確定されません。
          </p>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button
            onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >保存</button>
        </div>
      </div>
    </div>
  )
}
