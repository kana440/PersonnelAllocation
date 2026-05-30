import type { AllocationRow } from './allocationRow'
import type { AllCodeLists } from './codeLists/aggregate'
import type { OrgMasterEntry } from './codeLists/orgMaster'

export type DerivedUpdates = Partial<Record<keyof AllocationRow, string>>

/**
 * 変更後の値から自動導出フィールドを計算して返す。
 * ここに追加すれば自動導出が UI の変更パスすべてに伝播する。
 */
export function deriveFieldUpdates(
  changes: Partial<Record<keyof AllocationRow, string>>,
  currentRow: AllocationRow,
  codeLists:  AllCodeLists,
): DerivedUpdates {
  const derived: DerivedUpdates = {}

  if ('jobFamily' in changes) {
    derived.jobType  = ''
    derived.payGrade = ''
  }

  const newJobType = 'jobType' in changes ? (changes.jobType ?? '') : ((currentRow.jobType as string | undefined) ?? '')
  const newBand    = 'band'    in changes ? (changes.band    ?? '') : ((currentRow.band    as string | undefined) ?? '')

  if (('jobType' in changes || 'band' in changes) && newJobType && newBand) {
    const pg = computePayGrade(newJobType, newBand, codeLists)
    if (pg) derived.payGrade = pg
  }

  return derived
}

/** 上司ポジションコードから上司氏名を導出する */
export function deriveManagerName(
  managerPositionCode: string,
  allocationList: readonly AllocationRow[],
): string {
  if (!managerPositionCode) return ''
  const row = allocationList.find(r => r.positionCode === managerPositionCode)
  if (!row) return ''
  return [row.lastName, row.firstName].filter(Boolean).join(' ')
}

/** 組織コードから組織サブフィールド（BU〜チーム）を導出する */
export function deriveOrgSubFields(
  departmentCode: string,
  orgMasterEntries: readonly OrgMasterEntry[],
): Partial<Record<string, string>> | null {
  if (!departmentCode) return null
  const entry = orgMasterEntries.find(e => e.code === departmentCode && e.phase === 'after')
             ?? orgMasterEntries.find(e => e.code === departmentCode)
  if (!entry) return null
  return {
    businessUnit: entry.businessUnit,
    division:     entry.division,
    subDivision:  entry.department,
    group:        entry.group,
    team:         entry.team,
  }
}

function computePayGrade(jobTypeLabel: string, bandLabel: string, codeLists: AllCodeLists): string {
  const sub = codeLists.subJobFamilies.find(s => s.label === jobTypeLabel)
  if (!sub?.compensationCategory) return ''
  const pg  = codeLists.payGrades.find(
    p => p.compensationCategory === sub.compensationCategory && p.band === bandLabel
  )
  return pg?.label ?? ''
}
