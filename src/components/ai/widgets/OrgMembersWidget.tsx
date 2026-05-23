import type { PersonInfo } from '../../../application/aiTypes'

interface Props {
  orgName: string
  members: PersonInfo[]
}

export function OrgMembersWidget({ orgName, members }: Props) {
  if (members.length === 0) return null

  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100 flex items-center justify-between">
        <span>{orgName}</span>
        <span className="text-gray-400 font-normal">{members.length} 名</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {members.map(m => (
          <div key={m.userId} className="px-3 py-2 flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700 font-semibold flex-shrink-0">
              {m.name.charAt(0)}
            </div>
            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 truncate">{m.name}</span>
            <span className="text-xs text-gray-400 font-mono flex-shrink-0">{m.userId}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
