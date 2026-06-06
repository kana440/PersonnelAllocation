import type { PersonMatch } from '../../../application/aiTypes'

interface Props {
  persons: PersonMatch[]
  isActive: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function PromoteConfirmWidget({ persons, isActive, onConfirm, onCancel }: Props) {
  return (
    <div className="mt-2 border border-amber-200 rounded-xl overflow-hidden">
      <div className="divide-y divide-amber-50">
        {persons.map(p => (
          <div key={p.userId} className="px-3 py-2.5 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs text-amber-700 font-semibold flex-shrink-0 mt-0.5">
              {p.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-800">{p.name}</span>
              {p.currentOrgName && (
                <span className="ml-2 text-xs text-gray-500">{p.currentOrgName}</span>
              )}
              <div className="mt-0.5 text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                {p.currentPosition && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{p.currentPosition}</span>}
                {p.currentGrade && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{p.currentGrade}</span>}
                <span className="text-amber-600 font-medium">→ 昇格</span>
              </div>
            </div>
          </div>
        ))}
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
