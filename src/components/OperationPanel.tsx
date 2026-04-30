import { useStore } from '../store/useStore'
import type { OperationKind } from '../types/domain'

const OPERATION_LABELS: Record<OperationKind, string> = {
  MoveToOrg: '組織異動',
  AddConcurrent: '兼務追加',
  RemoveConcurrent: '兼務解除',
  SetManager: '上司変更',
  Promote: '昇格',
  SendOnSecondment: '出向',
  RecallFromSecondment: '出向解除',
  ChangeSecondment: '出向先変更',
  Hire: '入社',
  Retire: '退職',
  CreateVacantPosition: '空席ポジション作成',
  FillVacantPosition: '空席ポジション配置',
}

const OPERATION_COLORS: Partial<Record<OperationKind, string>> & { default: string } = {
  RecallFromSecondment: 'bg-red-50   border-red-200   text-red-800',
  SendOnSecondment:     'bg-green-50 border-green-200 text-green-800',
  MoveToOrg:            'bg-blue-50  border-blue-200  text-blue-800',
  AddConcurrent:        'bg-purple-50 border-purple-200 text-purple-800',
  RemoveConcurrent:     'bg-orange-50 border-orange-200 text-orange-800',
  Promote:              'bg-yellow-50 border-yellow-200 text-yellow-800',
  default:              'bg-gray-50   border-gray-200   text-gray-800',
}

export function OperationPanel() {
  const { operations, removeOperation } = useStore()
  const sorted = [...operations].sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-semibold text-gray-600 mb-2 flex-shrink-0">
        手順（操作リスト）
        <span className="ml-2 font-normal text-gray-400">人を選んで操作を追加 ↑</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {sorted.length === 0 && (
          <div className="text-gray-400 text-xs text-center py-6">操作がありません</div>
        )}
        {sorted.map((op, idx) => {
          const colorClass = OPERATION_COLORS[op.kind] ?? OPERATION_COLORS.default
          return (
            <div key={op.id} className={`flex items-center gap-2 border rounded px-2.5 py-1.5 ${colorClass}`}>
              <span className="text-sm font-bold opacity-30 w-4 text-center flex-shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-xs">{OPERATION_LABELS[op.kind]}</span>
                <span className="ml-2 text-xs opacity-70 truncate">{op.label}</span>
              </div>
              <span className="text-xs opacity-50 flex-shrink-0">{op.effectiveDate}</span>
              <button
                onClick={() => removeOperation(op.id)}
                className="text-xs opacity-30 hover:opacity-80 hover:text-red-600 flex-shrink-0 ml-1"
                title="削除"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
