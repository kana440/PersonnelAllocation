import type { PersonDiff } from '../types'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  targetOrgName: string
  hasImpact: boolean
  groups: Array<{ orgName: string; persons: PersonDiff[] }>
}

export function ImpactCheckWidget({ targetOrgName, hasImpact, groups }: Props) {
  if (!hasImpact) {
    return (
      <div className="mt-2 border border-green-200 bg-green-50 rounded-xl px-3 py-3">
        <div className="flex items-center gap-2 text-sm text-green-700">
          <span className="font-semibold">✓</span>
          <span>担当外組織（{targetOrgName} 以外）への変更は検出されませんでした。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 border border-orange-200 rounded-xl overflow-hidden">
      <div className="bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 border-b border-orange-100 flex items-center gap-1.5">
        <span>⚠</span>
        <span>担当外組織に変更があります</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {groups.map(g => (
          <div key={g.orgName} className="border-b border-gray-50 last:border-b-0">
            <div className="px-3 py-1.5 text-xs text-gray-500 font-medium bg-gray-50">{g.orgName}</div>
            <div className="px-3 py-1">
              <DiffTable diffs={g.persons} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
