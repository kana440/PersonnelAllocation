import { useState, useMemo } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { computeOrgComparison, resolveAutoMappedAfterOrg } from './helpers'
import { ComparisonPersonCard } from './ComparisonPersonCard'

interface Props {
  beforeOrgId:          string
  beforeOrgs:           Organization[]
  afterOrgs:            Organization[]
  allocationList:       AllocationRow[]
  comparisonOrgMapping: Record<string, string>
  onRemove:             () => void
  onRequestMap:         (beforeOrgId: string) => void
}

export function ComparisonOrgPanel({
  beforeOrgId,
  beforeOrgs,
  afterOrgs,
  allocationList,
  comparisonOrgMapping,
  onRemove,
  onRequestMap,
}: Props) {
  const [movedOutOpen, setMovedOutOpen] = useState(false)

  const beforeOrg = beforeOrgs.find(o => o.id === beforeOrgId)
  if (!beforeOrg) return null

  const autoAfterOrg = resolveAutoMappedAfterOrg(beforeOrg, afterOrgs)
  const mappedAfterOrgId = comparisonOrgMapping[beforeOrgId]
  const afterOrg = mappedAfterOrgId
    ? (afterOrgs.find(o => o.id === mappedAfterOrgId) ?? autoAfterOrg)
    : autoAfterOrg

  const { persons, autoMapped } = useMemo(
    () => computeOrgComparison(beforeOrg, afterOrg ?? null, allocationList, afterOrgs, beforeOrgs),
    [beforeOrg, afterOrg, allocationList, afterOrgs, beforeOrgs],
  )

  const stayed   = persons.filter(e => e.status === 'stayed')
  const movedIn  = persons.filter(e => e.status === 'moved-in')
  const movedOut = persons.filter(e => e.status === 'moved-out')

  const nameChanged = afterOrg && afterOrg.name !== beforeOrg.name

  return (
    <div className="flex-shrink-0 w-56 border-2 border-gray-300 rounded-lg bg-white flex flex-col">
      {/* ヘッダー */}
      <div className="px-2.5 py-1.5 border-b border-gray-300 bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="flex-1 text-xs font-semibold text-gray-700 truncate">{beforeOrg.name}</span>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 text-[10px] flex-shrink-0"
            title="パネルを閉じる"
          >✕</button>
        </div>
        {afterOrg ? (
          <div className="text-[10px] text-gray-500">
            {autoMapped && !nameChanged
              ? <span className="text-gray-400">（同一組織）</span>
              : nameChanged
                ? <span>→ <span className="font-medium text-blue-600">{afterOrg.name}</span></span>
                : null
            }
          </div>
        ) : (
          <button
            onClick={() => onRequestMap(beforeOrgId)}
            className="text-[10px] text-amber-600 hover:text-amber-800 hover:underline"
          >
            ❔ 対応する新組織を選択...
          </button>
        )}
      </div>

      {/* 本体 */}
      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* 在籍 */}
        {stayed.map(e => (
          <ComparisonPersonCard key={e.row.rowId} entry={e} />
        ))}

        {/* 転入 */}
        {movedIn.length > 0 && (
          <>
            {(stayed.length > 0) && <div className="border-t border-dashed border-green-200" />}
            {movedIn.map(e => (
              <ComparisonPersonCard key={e.row.rowId} entry={e} />
            ))}
          </>
        )}

        {/* 転出（折りたたみ） */}
        {movedOut.length > 0 && (
          <div className="mt-1">
            <div className="border-t border-gray-200" />
            <button
              onClick={() => setMovedOutOpen(v => !v)}
              className="w-full flex items-center gap-1 py-1 text-[10px] text-gray-500 hover:text-gray-700"
            >
              <span>{movedOutOpen ? '▼' : '▶'}</span>
              <span>転出 {movedOut.length}名</span>
            </button>
            {movedOutOpen && (
              <div className="flex flex-col gap-1">
                {movedOut.map(e => (
                  <ComparisonPersonCard key={e.row.rowId} entry={e} />
                ))}
              </div>
            )}
          </div>
        )}

        {persons.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-2">データなし</p>
        )}
      </div>
    </div>
  )
}
