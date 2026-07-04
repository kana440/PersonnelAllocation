import { useUserSession } from '../../store/useUserSession'

export function ScopeSelector() {
  const { session } = useUserSession()

  if (session.role !== 'assignee') return null

  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
      <span className="text-xs text-gray-400 whitespace-nowrap">担当者:</span>
      <span className="px-2 py-0.5 rounded bg-blue-700 text-blue-100 text-xs truncate max-w-[140px]">
        {session.assigneeName ?? '（未選択）'}
      </span>
    </div>
  )
}
