import type { IssueGroup } from './types'

interface Props {
  group:        IssueGroup
  onDrillDown:  () => void
  onBulkEdit?:  () => void
}

export function ErrorGroup({ group, onDrillDown, onBulkEdit }: Props) {
  return (
    <div className="border border-red-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50">
        <span className="text-red-600 font-bold text-[11px]">✕</span>
        <span className="flex-1 text-xs font-medium text-red-800">{group.message}</span>
        <span className="text-sm font-bold text-red-600">{group.instances.length}</span>
        {onBulkEdit && (
          <button
            onClick={onBulkEdit}
            className="text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors whitespace-nowrap"
          >
            一括修正
          </button>
        )}
        <button
          onClick={onDrillDown}
          className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          一覧 →
        </button>
      </div>
      <div className="px-3 py-1.5 space-y-0.5 bg-white">
        {group.instances.slice(0, 5).map(inst => (
          <div key={inst.rowId} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="font-medium">{inst.personName || '（空席）'}</span>
            {inst.orgCode && <span className="text-gray-400">{inst.orgCode}</span>}
          </div>
        ))}
        {group.instances.length > 5 && (
          <div className="text-[10px] text-gray-400 pl-3">他 {group.instances.length - 5} 名…</div>
        )}
      </div>
    </div>
  )
}
