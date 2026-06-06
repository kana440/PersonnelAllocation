import type { AdminPosition, PositionStatus } from '../../../infrastructure/api/adminApi'

interface Props {
  positions:     AdminPosition[]
  statusFilter:  PositionStatus | 'all'
  onAcquire:     (pos: AdminPosition) => void
  onEditNotes:   (pos: AdminPosition) => void
  onRetire:      (pos: AdminPosition) => void
  onRelease:     (pos: AdminPosition) => void
  onDelete:      (pos: AdminPosition) => void
}

const STATUS_LABEL: Record<PositionStatus, string> = {
  available: '利用可能',
  in_use:    '使用中',
  retired:   '廃止',
}
const STATUS_COLOR: Record<PositionStatus, string> = {
  available: 'bg-green-100 text-green-700',
  in_use:    'bg-blue-100 text-blue-700',
  retired:   'bg-gray-100 text-gray-400',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP')
}

export function PositionTable({
  positions, statusFilter, onAcquire, onEditNotes, onRetire, onRelease, onDelete,
}: Props) {
  const filtered = statusFilter === 'all'
    ? positions
    : positions.filter(p => p.status === statusFilter)

  if (filtered.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">該当するポジションがありません</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-36">コード</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-24">状態</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">取得者</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">取得日</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">備考</th>
            <th className="px-4 py-2.5 w-36" />
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.code} className={`border-b border-gray-100 hover:bg-gray-50 ${p.status === 'retired' ? 'opacity-50' : ''}`}>
              <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{p.code}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">{p.acquiredBy ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.acquiredAt)}</td>
              <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{p.notes ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  {p.status === 'available' && (
                    <>
                      <button onClick={() => onAcquire(p)} className="text-xs text-blue-600 hover:underline">取得</button>
                      <button onClick={() => onRetire(p)}  className="text-xs text-gray-500 hover:underline">廃止</button>
                      <button onClick={() => onDelete(p)}  className="text-xs text-red-500 hover:underline">削除</button>
                    </>
                  )}
                  {p.status === 'in_use' && (
                    <>
                      <button onClick={() => onEditNotes(p)} className="text-xs text-blue-600 hover:underline">備考編集</button>
                      <button onClick={() => onRelease(p)}   className="text-xs text-gray-500 hover:underline">差し戻し</button>
                    </>
                  )}
                  {p.status === 'retired' && (
                    <button onClick={() => onRelease(p)} className="text-xs text-gray-500 hover:underline">復活</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
