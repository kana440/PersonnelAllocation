import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person } from '@personnel/domain/schemas'
import { useBeforeOrgView } from './BeforeOrgViewContext'

interface Props {
  row:   AllocationRow
  orgId: string  // この行が属する before-org の id
}

export function BeforeRowCard({ row, orgId }: Props) {
  const {
    persons, afterOrganizations, beforeOrganizations,
    comparisonOrgMapping, selectedIds, toggleSelect,
  } = useBeforeOrgView()

  const person     = persons.find((p: Person) => p.sfPersonId === row.userId)
  const name       = person?.name ?? row.userId ?? '（空席）'
  const isSelected = !!row.userId && selectedIds.has(row.userId)

  // 移動先の判定
  const beforeOrg      = beforeOrganizations.find(o => o.id === orgId)
  const mappedAfterId  = comparisonOrgMapping[orgId]
  const mappedAfterOrg = mappedAfterId ? afterOrganizations.find(o => o.id === mappedAfterId) : null
  const stayed         = row.departmentCode === beforeOrg?.externalCode
  const toMapped       = !stayed && !!mappedAfterOrg && row.departmentCode === mappedAfterOrg.externalCode
  const destOrg        = !stayed ? afterOrganizations.find(o => o.externalCode === row.departmentCode) : null

  // stayed → 濃いグレー「在」 / toMapped → 薄いグレー「→」 / elsewhere → オレンジ「→」
  const badgeCls = stayed
    ? 'bg-gray-200 text-gray-600'
    : toMapped
      ? 'bg-gray-100 text-gray-400'
      : 'bg-orange-100 text-orange-600'

  return (
    <div
      data-before-personid={row.userId ?? ''}
      className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors
        ${isSelected ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-amber-50/60'}`}
      onClick={e => row.userId && toggleSelect(row.userId, e.ctrlKey || e.metaKey)}
    >
      <span className={`flex-shrink-0 text-[8px] font-bold px-0.5 rounded ${badgeCls}`}>
        {stayed ? '在' : '→'}
      </span>
      <span className="flex-1 text-[10px] text-gray-800 truncate">{name}</span>
      {!stayed && destOrg && (
        <span className={`text-[9px] truncate flex-shrink-0 max-w-[65px] ${toMapped ? 'text-gray-400' : 'text-orange-500'}`}>
          {destOrg.name}
        </span>
      )}
    </div>
  )
}
