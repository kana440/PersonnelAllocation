import { useUserSession } from '../../store/useUserSession'

export function ScopeSelector() {
  const { session } = useUserSession()

  if (session.role === 'assignee') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <label className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">担当者</label>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-700 text-blue-100 text-xs max-w-[180px]">
          <span className="truncate">{session.assigneeName ?? '（未選択）'}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="px-2.5 py-1 rounded bg-gray-700 text-gray-300 text-xs whitespace-nowrap">
        管理者モード
      </span>
    </div>
  )
}
