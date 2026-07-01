import type { AllocationRow } from '../../allocationRow'

export function deriveManagerName(
  managerPositionCode: string | undefined | null,
  allocationList: readonly AllocationRow[],
): string | undefined {
  if (!managerPositionCode) return undefined
  const mgrRow = allocationList.find(r => r.positionCode === managerPositionCode && r.userId)
  if (!mgrRow) return undefined
  return [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ') || undefined
}

export function reDeriveManagerNamesForList(
  allocationList: AllocationRow[],
): AllocationRow[] {
  const posToName = new Map<string, string>()
  for (const r of allocationList) {
    if (r.positionCode && r.userId) {
      posToName.set(
        r.positionCode as string,
        [r.lastName, r.firstName].filter(Boolean).join(', '),
      )
    }
  }
  return allocationList.map(r => {
    if (!r.managerPositionCode) return r
    const newName = posToName.get(r.managerPositionCode as string)
    if (newName === undefined || newName === (r.managerName as string | undefined)) return r
    return { ...r, managerName: newName }
  })
}
