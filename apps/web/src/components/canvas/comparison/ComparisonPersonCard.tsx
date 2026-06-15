import type { PersonComparisonEntry } from './types'

interface Props {
  entry: PersonComparisonEntry
}

export function ComparisonPersonCard({ entry }: Props) {
  const { row, status, relatedOrgName } = entry
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || '（不明）'
  const title = row.localJobTitle ?? row.officialPositionCode ?? ''

  if (status === 'stayed') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
        <span className="flex-1 font-medium text-gray-800 truncate">{name}</span>
        {title && <span className="text-gray-400 truncate max-w-20">{title}</span>}
      </div>
    )
  }

  if (status === 'moved-in') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs">
        <span className="flex-1 font-medium text-green-800 truncate">{name}</span>
        {title && <span className="text-green-500 truncate max-w-16">{title}</span>}
        <span className="flex-shrink-0 text-[10px] bg-green-100 text-green-700 px-1 rounded">
          ← {relatedOrgName}
        </span>
      </div>
    )
  }

  // moved-out
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs opacity-60">
      <span className="flex-1 font-medium text-gray-500 truncate">{name}</span>
      {title && <span className="text-gray-400 truncate max-w-16">{title}</span>}
      <span className="flex-shrink-0 text-[10px] bg-gray-200 text-gray-600 px-1 rounded">
        → {relatedOrgName}
      </span>
    </div>
  )
}
