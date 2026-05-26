// Pure helpers for deriving org sub-fields and manager name in domain operations.
import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists }  from '../codeLists/aggregate'

/**
 * Returns businessUnit/division/subDivision/group/team derived from orgMasterEntries.
 * Prefers the 'after' phase entry; falls back to any matching entry.
 * Returns an empty object when no matching entry is found (fields unchanged).
 */
export function deriveOrgSubFields(
  departmentCode: string,
  codeLists: AllCodeLists,
): Pick<AllocationRow, 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'> {
  const entry = codeLists.orgMasterEntries.find(e => e.code === departmentCode && e.phase === 'after')
             ?? codeLists.orgMasterEntries.find(e => e.code === departmentCode)
  if (!entry) return {} as Pick<AllocationRow, 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'>
  return {
    businessUnit: entry.businessUnit || undefined,
    division:     entry.division     || undefined,
    subDivision:  entry.department   || undefined,  // OrgMasterEntry.department → AllocationRow.subDivision
    group:        entry.group        || undefined,
    team:         entry.team         || undefined,
  } as Pick<AllocationRow, 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'>
}

/**
 * Derives managerName from the person currently occupying managerPositionCode.
 * Returns undefined when managerPositionCode is unset or the position has no occupant.
 */
export function deriveManagerName(
  managerPositionCode: string | undefined,
  allocationList: AllocationRow[],
): string | undefined {
  if (!managerPositionCode) return undefined
  const mgrRow = allocationList.find(r => r.positionCode === managerPositionCode && r.userId)
  if (!mgrRow) return undefined
  return [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ') || undefined
}

// ── バッチ再導出（リスト全体に適用する純粋関数） ───────────────────────────────

/**
 * 全行の managerName を在籍者の現在の姓名に合わせて再導出する。
 * 変化がない行は同一参照を返す（差分検出に利用可能）。
 */
export function reDeriveManagerNamesForList(
  allocationList: AllocationRow[],
): AllocationRow[] {
  const posToName = new Map<string, string>()
  for (const r of allocationList) {
    if (r.positionCode && r.userId) {
      posToName.set(r.positionCode, [r.lastName, r.firstName].filter(Boolean).join(', '))
    }
  }
  return allocationList.map(r => {
    if (!r.managerPositionCode) return r
    const newName = posToName.get(r.managerPositionCode as string)
    if (newName === undefined || newName === (r.managerName ?? '')) return r
    return { ...r, managerName: newName }
  })
}

/**
 * 全行の businessUnit/division/subDivision/group/team を orgMasterEntries から再導出する。
 * 変化がない行は同一参照を返す（差分検出に利用可能）。
 */
export function reDeriveOrgSubFieldsForList(
  allocationList: AllocationRow[],
  codeLists: AllCodeLists,
): AllocationRow[] {
  return allocationList.map(r => {
    if (!r.departmentCode) return r
    const derived = deriveOrgSubFields(r.departmentCode as string, codeLists)
    if (
      r.businessUnit === derived.businessUnit &&
      r.division     === derived.division     &&
      r.subDivision  === derived.subDivision  &&
      r.group        === derived.group        &&
      r.team         === derived.team
    ) return r
    return { ...r, ...derived }
  })
}
