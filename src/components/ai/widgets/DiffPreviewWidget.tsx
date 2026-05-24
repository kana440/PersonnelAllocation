import type { PersonDiff } from '../../../application/aiTypes'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  persons: PersonDiff[]
  label?: string
  isActive: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DiffPreviewWidget({ persons, label, isActive, onConfirm, onCancel }: Props) {
  const showOrgColumn = persons.some(d => d.before.orgName !== d.after.orgName && (d.before.orgName || d.after.orgName))
  return (
    <div className="mt-2 border border-amber-200 rounded-xl overflow-hidden">
      {label && (
        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-amber-700">{label}</div>
      )}
      <div className="px-3 py-2 max-h-72 overflow-y-auto">
        <DiffTable diffs={persons} showOrgColumn={showOrgColumn} />
      </div>
      {isActive && (
        <div className="bg-amber-50 px-3 py-2.5 flex gap-2 border-t border-amber-100">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
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
