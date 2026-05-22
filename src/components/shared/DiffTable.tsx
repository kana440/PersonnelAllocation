import type { PersonDiff } from '../ai/types'

interface Props {
  diffs: PersonDiff[]
  showOrgColumn?: boolean
}

export function DiffTable({ diffs, showOrgColumn = false }: Props) {
  if (diffs.length === 0) return null

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-400 border-b border-gray-100">
          <th className="text-left py-1.5 px-2 font-medium">氏名</th>
          {showOrgColumn && <th className="text-left py-1.5 px-2 font-medium">組織</th>}
          <th className="text-left py-1.5 px-2 font-medium">等級</th>
          <th className="text-left py-1.5 px-2 font-medium">役職</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {diffs.map(d => (
          <tr key={d.rowId} className="text-gray-700">
            <td className="py-2 px-2">
              <div className="font-medium">{d.name}</div>
              {d.orgName && !showOrgColumn && (
                <div className="text-gray-400">{d.orgName}</div>
              )}
            </td>
            {showOrgColumn && (
              <td className="py-2 px-2">
                <DiffCell before={d.before.orgName} after={d.after.orgName} />
              </td>
            )}
            <td className="py-2 px-2">
              <DiffCell before={d.before.grade} after={d.after.grade ?? d.after.note} />
            </td>
            <td className="py-2 px-2">
              <DiffCell before={d.before.position} after={d.after.position ?? d.after.note} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DiffCell({ before, after }: { before?: string; after?: string }) {
  if (!before && !after) return <span className="text-gray-300">—</span>
  if (before === after)  return <span>{before ?? '—'}</span>
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-gray-400 line-through">{before ?? '—'}</span>
      <span className="text-gray-300 text-xs">→</span>
      <span className="text-blue-600 font-medium">{after ?? '—'}</span>
    </div>
  )
}
