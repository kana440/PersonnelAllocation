import type { ApiRound, RoundStatus } from '../../../infrastructure/api/adminApi'

interface Props {
  rounds:   ApiRound[]
  onSelect: (round: ApiRound) => void
}

const STATUS_LABELS: Record<RoundStatus, string> = {
  draft:       '下書き',
  in_progress: '進行中',
  ready:       '確定待ち',
  merged:      '確定済み',
}

const STATUS_COLORS: Record<RoundStatus, string> = {
  draft:       'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  ready:       'bg-yellow-100 text-yellow-700',
  merged:      'bg-green-100 text-green-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function RoundTable({ rounds, onSelect }: Props) {
  if (rounds.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        申請回がありません
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">申請回名</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-24">種別</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">ステータス</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">前回申請回</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-36">作成者</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-40">作成日時</th>
            <th className="px-4 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody>
          {rounds.map(r => (
            <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">
                {r.label}
                <span className="ml-2 font-mono text-xs text-gray-400">{r.id.slice(0, 8)}…</span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {r.kind === 'annual' ? '通常' : '補正'}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">{r.based_on_round_id?.slice(0, 8) ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">{r.created_by_name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(r.created_at)}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onSelect(r)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  詳細
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
