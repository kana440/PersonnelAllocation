import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useStore }           from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useBeforeOrgView }   from './BeforeOrgViewContext'
import { getBeforePositionTitle, getEmpBorderClass } from '../panel/helpers'

interface Props {
  row:    AllocationRow
  orgId:  string
  depth?: number
}

export function BeforeRowCard({ row, orgId, depth = 0 }: Props) {
  const {
    comparisonOrgMapping, selectedIds, toggleSelect,
    beforeOrgById, afterOrgMap, personBySfId,
  } = useBeforeOrgView()

  const masters           = useStore(s => s.masters)
  const selectedCardRowId = useStore(s => s.selectedCardRowId)
  const selectCard        = useStore(s => s.selectCard)
  const requestScrollToRow = useCanvasLayoutStore(s => s.requestScrollToRow)

  const person  = row.userId ? personBySfId.get(row.userId) : undefined
  const isVacant = !person

  const beforeOrg      = beforeOrgById.get(orgId)
  const mappedAfterId  = comparisonOrgMapping[orgId]
  const mappedAfterOrg = mappedAfterId ? afterOrgMap.get(mappedAfterId) : null
  const stayed         = row.departmentCode === beforeOrg?.externalCode
  const toMapped       = !stayed && !!mappedAfterOrg && row.departmentCode === mappedAfterOrg.externalCode
  const destOrg        = !stayed && row.departmentCode ? afterOrgMap.get(row.departmentCode) : null

  const isSingleSelected = selectedCardRowId === row.rowId
  const isMultiSelected  = !!person && selectedIds.has(person.id)

  const posTitle  = getBeforePositionTitle(row)
  const empBorder = getEmpBorderClass(row, masters.employmentTypes)

  const bgClass = isSingleSelected ? 'bg-yellow-50'
    : isMultiSelected               ? 'bg-blue-50'
    : isVacant                      ? 'bg-gray-50'
    : 'bg-white'

  const borderColorClass = isSingleSelected
    ? 'border-yellow-400 ring-1 ring-yellow-300'
    : isMultiSelected
      ? 'border-blue-300 ring-1 ring-blue-200'
      : 'border-gray-200'

  const badgeCls = stayed
    ? 'bg-gray-200 text-gray-600'
    : toMapped
      ? 'bg-gray-100 text-gray-400'
      : 'bg-orange-100 text-orange-600'

  return (
    <div data-before-rowid={row.rowId} style={depth ? { paddingLeft: `${depth * 12}px` } : undefined}>
    <div
      className={`my-0.5 px-2 py-1 text-xs rounded border border-l-4 shadow-sm select-none min-w-0 cursor-pointer
        ${empBorder} ${borderColorClass} ${bgClass}`}
      onClick={e => {
        if (e.ctrlKey || e.metaKey) {
          if (person) toggleSelect(person.id, true)
        } else {
          selectCard(row.rowId, 'before')
          requestScrollToRow(row.rowId)
        }
      }}
    >
      {/* 1行目: 氏名 + 在/→ バッジ */}
      <div className="flex items-center gap-1 min-w-0">
        {isVacant ? (
          <span className="italic truncate flex-1 text-gray-400">（空席）</span>
        ) : (
          <span className="font-semibold text-gray-800 truncate flex-1 leading-tight">{person!.name}</span>
        )}
        {!isVacant && (
          <span className={`flex-shrink-0 text-[8px] font-bold px-0.5 rounded ${badgeCls}`}>
            {stayed ? '在' : '→'}
          </span>
        )}
      </div>

      {/* 2行目: ポジション + 雇用タイプ + 移動先組織 */}
      {!isVacant && (posTitle || row.prevEmploymentType || !stayed) && (
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          {posTitle && <span className="text-gray-600 truncate flex-1">{posTitle}</span>}
          {row.prevEmploymentType && (
            <span className="flex-shrink-0 text-[9px] text-gray-400 truncate max-w-[4rem]">{row.prevEmploymentType}</span>
          )}
          {!stayed && destOrg && (
            <span className={`flex-shrink-0 text-[9px] truncate max-w-[60px] ${toMapped ? 'text-gray-400' : 'text-orange-500'}`}>
              {destOrg.name}
            </span>
          )}
        </div>
      )}
    </div>
    </div>
  )
}
