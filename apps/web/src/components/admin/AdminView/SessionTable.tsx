import type { AdminSession, SessionStatus } from '../../../infrastructure/api/adminApi'

interface Props {
  sessions: AdminSession[]
  onDelete: (session: AdminSession) => void
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  draft:     '下書き',
  submitted: '提出済み',
  finalized: '確定',
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  finalized: 'bg-green-100 text-green-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function SessionTable({ sessions, onDelete }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        セッションがありません
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">セッション名</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">ステータス</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-36">作成者</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-16 text-right">行数</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-40">作成日時</th>
            <th className="px-4 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">
                {s.name}
                <span className="ml-2 font-mono text-xs text-gray-400">{s.id.slice(0, 8)}…</span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                  {STATUS_LABELS[s.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{s.creator_name ?? s.created_by}</td>
              <td className="px-4 py-3 text-gray-500 text-right">{s.row_count.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.created_at)}</td>
              <td className="px-4 py-3">
                {s.status === 'draft' && (
                  <button
                    onClick={() => onDelete(s)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  >
                    削除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
