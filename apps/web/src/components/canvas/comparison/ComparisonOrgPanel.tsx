import { useState, useMemo } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { computeOrgComparison, resolveAutoMappedAfterOrg } from './helpers'
import { ComparisonPersonCard } from './ComparisonPersonCard'
import { useStore }             from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PersonComparisonEntry } from './types'

function ComparisonBandChip({ entry }: { entry: PersonComparisonEntry }) {
  const { row, status, relatedOrgName } = entry
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || '（不明）'
  const chipClass =
    status === 'moved-in'  ? 'border-green-400 bg-green-50 text-green-800' :
    status === 'moved-out' ? 'border-gray-300 bg-gray-50 text-gray-400 line-through' :
    'border-blue-400 bg-white text-gray-800'
  return (
    <div
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border-l-2 select-none ${chipClass}`}
      title={relatedOrgName ? `${status === 'moved-in' ? '←' : '→'} ${relatedOrgName}` : undefined}
    >
      {name}
    </div>
  )
}

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
  const { masters }     = useStore()
  const { canvasPanelStyle } = useCanvasLayoutStore()
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

  // バンド別グループ（band モード用）: stayed + moved-in のみ表示（転出は省略）
  const bandGroups = useMemo(() => {
    if (canvasPanelStyle !== 'band') return []
    const groups = new Map<string, PersonComparisonEntry[]>()
    for (const entry of [...stayed, ...movedIn]) {
      const band = (entry.row.positionBand as string | undefined) ?? '(未設定)'
      const arr  = groups.get(band)
      if (arr) arr.push(entry)
      else groups.set(band, [entry])
    }
    return [...groups.entries()]
      .sort(([bandA], [bandB]) => {
        const lvA = masters.jobLevels.find(e => e.label === bandA)?.promotionDemotionWarningLevel ?? -1
        const lvB = masters.jobLevels.find(e => e.label === bandB)?.promotionDemotionWarningLevel ?? -1
        return lvB - lvA
      })
      .map(([band, items]) => ({ band, items }))
  }, [canvasPanelStyle, stayed, movedIn, masters.jobLevels])

  return (
    <div className={`flex-shrink-0 border-2 border-gray-300 rounded-lg bg-white flex flex-col ${canvasPanelStyle === 'band' ? 'w-44' : 'w-56'}`}>
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
      {canvasPanelStyle === 'band' ? (
        <div className="p-1.5 flex-1">
          {bandGroups.length === 0
            ? <p className="text-[10px] text-gray-400 text-center py-2">データなし</p>
            : bandGroups.map(({ band, items }) => (
              <div key={band} className="mb-1.5">
                <div className="text-[9px] font-semibold text-gray-400 tracking-wider mb-0.5 px-0.5 leading-none">
                  {band}
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map(e => <ComparisonBandChip key={e.row.rowId} entry={e} />)}
                </div>
              </div>
            ))
          }
          {movedOut.length > 0 && (
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                onClick={() => setMovedOutOpen(v => !v)}
                className="w-full flex items-center gap-1 py-0.5 text-[9px] text-gray-400 hover:text-gray-600"
              >
                <span>{movedOutOpen ? '▼' : '▶'}</span>
                <span>転出 {movedOut.length}名</span>
              </button>
              {movedOutOpen && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {movedOut.map(e => <ComparisonBandChip key={e.row.rowId} entry={e} />)}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  )
}
