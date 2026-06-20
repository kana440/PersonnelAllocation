import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import type { PersonDiff } from '../../../application/aiTypes'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  persons: PersonDiff[]
  targetOrgName: string
  transferReason?: string
  label?: string
  isActive: boolean
  onConfirm: (userInputs: Record<string, string>) => void
  onCancel: () => void
}

export function OrgTransferWidget({
  persons, targetOrgName, transferReason: initialReason, label, isActive, onConfirm, onCancel,
}: Props) {
  const { masters } = useStore()
  const [transferReason, setTransferReason] = useState(initialReason ?? '')

  const transferReasonOptions = useMemo(
    () => masters.transferReasons?.map((e: { label: string }) => e.label) ?? [],
    [masters]
  )

  const canSubmit = !!transferReason

  return (
    <div className="mt-2 border border-blue-200 rounded-xl overflow-hidden">
      <div className="px-3 pt-2 pb-1.5 bg-blue-50 border-b border-blue-100">
        <span className="text-xs font-semibold text-blue-700">{label ?? '組織異動の確認'}</span>
        <span className="ml-2 text-xs text-blue-600">→ {targetOrgName}</span>
        <span className="ml-1 text-xs text-blue-400">（{persons.length}名）</span>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* 対象者一覧 */}
        {persons.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            <DiffTable diffs={persons} showOrgColumn={true} />
          </div>
        )}

        {/* 異動事由 */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            異動事由 <span className="text-red-400">*</span>
          </label>
          {transferReasonOptions.length > 0 ? (
            <select
              value={transferReason}
              onChange={e => setTransferReason(e.target.value)}
              className={`w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                !transferReason ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">（選択してください）</option>
              {transferReasonOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input type="text" value={transferReason}
              onChange={e => setTransferReason(e.target.value)}
              placeholder="異動事由を入力"
              className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                !transferReason ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          )}
        </div>
      </div>

      {isActive && (
        <div className="bg-blue-50 px-3 py-2.5 flex gap-2 border-t border-blue-100">
          <button onClick={() => canSubmit && onConfirm({ transferReason })} disabled={!canSubmit}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
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
