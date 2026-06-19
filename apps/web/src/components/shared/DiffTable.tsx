import React from 'react'
import type { PersonDiff } from '../../application/aiTypes'

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
          <React.Fragment key={d.rowId}>
            <tr className="text-gray-700">
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
                <DiffCell before={d.before.grade} after={d.after.grade} />
              </td>
              <td className="py-2 px-2">
                <DiffCell before={d.before.position} after={d.after.position} />
                {(d.before.note || d.after.note) && (
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    {d.before.note && d.before.note !== d.after.note && <span className="line-through mr-1">{d.before.note}</span>}
                    {d.after.note && <span className="text-blue-500">{d.after.note}</span>}
                  </div>
                )}
              </td>
            </tr>
            {d.fields && d.fields.length > 0 && (
              <tr className="bg-amber-50/40">
                <td colSpan={showOrgColumn ? 4 : 3} className="py-1.5 px-2 pb-2">
                  <div className="text-[10px] text-amber-700 font-medium mb-1">連動変更</div>
                  <div className="space-y-0.5">
                    {d.fields.map(f => (
                      <div key={f.label} className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-gray-500 min-w-[100px] shrink-0">{f.label}</span>
                        <span className="text-gray-400 line-through">{f.before || '—'}</span>
                        <span className="text-gray-300 text-[10px]">→</span>
                        <span className="text-blue-600">{f.after || '—'}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
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
