import { useState } from 'react'
import { OrgCombobox } from '../../common/OrgCombobox'
import type { Organization } from '@personnel/domain/schemas'

interface SelectMoveModalProps {
  selectedCount: number
  allOrgs:       Organization[]
  onConfirm:     (targetOrgId: string) => void
  onCancel:      () => void
}

export function SelectMoveModal({ selectedCount, allOrgs, onConfirm, onCancel }: SelectMoveModalProps) {
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const handleConfirm = () => {
    if (!targetOrgId) { setError('移動先を選択してください'); return }
    onConfirm(targetOrgId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-96 p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-bold text-gray-800">組織を移動</div>
        <div className="text-xs text-gray-600">
          <span className="font-semibold text-gray-800">{selectedCount}名</span> を移動先組織に移動します。
          <br />レポートラインは変更されません。
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">移動先組織</label>
          <OrgCombobox
            allOrgs={allOrgs}
            value={targetOrgId}
            onChange={id => { setTargetOrgId(id); setError(null) }}
            placeholder="組織を選択…"
            variant="light"
            className="w-full"
          />
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!targetOrgId}
            className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            移動する（{selectedCount}名）
          </button>
        </div>
      </div>
    </div>
  )
}
