// コンポーネント後方互換のため allocationList から
// Person / Position / Affiliation / Company を導出するヘルパー群
//
// 将来的にコンポーネントが allocationList を直接参照するようになれば削除可能。

import type { AllocationRow } from '../allocationRow'
import type { Person, Position, Affiliation, Company, Organization } from '../schemas'

// ── Person ──────────────────��──────────────────────��──────────────────────────

export function derivePersons(rows: AllocationRow[]): Person[] {
  const seen = new Set<string>()
  const persons: Person[] = []
  for (const row of rows) {
    const key = row.userId
    if (!key || seen.has(key)) continue
    seen.add(key)
    persons.push({
      id:              `p_${row.userId}`,
      name:            [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId,
      sfPersonId:      row.userId,
      employeeNumber:  row.employeeNumber,
      groupEmployeeId: row.groupEmployeeId,
    })
  }
  return persons
}

// ── Company ────────────────────��───────────────────��──────────────────────────
// organizations から一意な companyId を抽出して返す（storage に保持している companies を優先）

export function deriveCompanies(
  orgs:      Organization[],
  companies: Company[],
): Company[] {
  // 既存の companies をベースに、org に含まれる companyId をカバーする
  const covered = new Set(companies.map(c => c.id))
  const extra: Company[] = orgs
    .map(o => o.companyId)
    .filter(id => id && !covered.has(id))
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map(id => ({ id, name: id, hasSF: true }))
  return [...companies, ...extra]
}

// ── Position (before) ──────────────────────���──────────────────────────────────

export function deriveBeforePositions(
  rows: AllocationRow[],
  orgs: Organization[],
): Position[] {
  return rows.flatMap(row => {
    if (!row.prevDepartmentCode && !row.prevPositionCode) return []
    const org = orgs.find(o => o.externalCode === row.prevDepartmentCode || o.id === row.prevDepartmentCode)
    return [{
      id:                           `pos_b_${row.rowId}`,
      orgId:                        org?.id ?? row.prevDepartmentCode ?? '',
      companyId:                    org?.companyId ?? '',
      title:                        row.prevOfficialPositionCode,
      band:                         row.prevPositionBand ?? row.prevBand,
      isVacant:                     false,
      sfPositionId:                 row.prevPositionCode,
      workLocation:                 row.prevLocation,
      costCenter:                   row.prevCostCenter,
      jobFamily:                    row.prevJobFamily,
      jobType:                      row.prevJobType,
      managerPositionCode:          row.prevManagerPositionCode,
      isTrainingPosition:           row.prevTrainingPositionFlag === '○',
      isUnionPosition:              row.prevPositionUnionFlag === '○',
      isDiscretionaryLaborPosition: row.prevPositionDiscretionaryWorkFlag === '○',
    }]
  })
}

// ── Position (after) ─────────────────────���────────────────────────────────────

export function deriveAfterPositions(
  computedRows: AllocationRow[],
  orgs:         Organization[],
): Position[] {
  return computedRows.flatMap(row => {
    if (!row.departmentCode && !row.positionCode) return []
    const org = orgs.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
    return [{
      id:                           `pos_a_${row.rowId}`,
      orgId:                        org?.id ?? row.departmentCode ?? '',
      companyId:                    org?.companyId ?? '',
      title:                        row.officialPositionCode,
      band:                         row.positionBand ?? row.band,
      isVacant:                     false,
      sfPositionId:                 row.positionCode,
      workLocation:                 row.location,
      costCenter:                   row.costCenter,
      jobFamily:                    row.jobFamily,
      jobType:                      row.jobType,
      managerPositionCode:          row.managerPositionCode,
      isTrainingPosition:           row.trainingPositionFlag === '○',
      isUnionPosition:              row.positionUnionFlag === '○',
      isDiscretionaryLaborPosition: row.positionDiscretionaryWorkFlag === '○',
    }]
  })
}

// ── Affiliation (before) ────────────────────���────────────────────────────���────

export function deriveBeforeAffiliations(
  rows:    AllocationRow[],
  persons: Person[],
): Affiliation[] {
  return rows.flatMap(row => {
    if (!row.prevDepartmentCode && !row.prevPositionCode && !row.prevConcurrentType) return []
    const person = persons.find(p => p.sfPersonId === row.userId)
    if (!person) return []
    return [{
      id:                          `aff_b_${row.rowId}`,
      personId:                    person.id,
      positionId:                  `pos_b_${row.rowId}`,
      type:                        row.prevConcurrentType === '兼務' ? 'concurrent' : 'primary',
      status:                      'active' as const,
      startDate:                   '2000-01-01',
      employmentType:              row.prevEmploymentType,
      concurrentReason:            row.prevConcurrentReason,
      isOnLeave:                   row.prevLeaveFlag === '○',
      individualBand:              row.prevBand,
      salaryGrade:                 row.prevPayGrade,
      freeTitle:                   row.prevLocalJobTitle,
      isNonUnionAgreement:         row.prevNonUnionAgreementFlag === '○',
      isUnionMember:               row.prevUnionFlag === '○',
      isDiscretionaryLabor:        row.prevDiscretionaryWorkFlag === '○',
    }]
  })
}

// ── Affiliation (after) ─────────────────────────��─────────────────────────���───

export function deriveAfterAffiliations(
  computedRows: AllocationRow[],
  persons:      Person[],
): Affiliation[] {
  return computedRows.flatMap(row => {
    if (!row.departmentCode && !row.positionCode && !row.concurrentType) return []
    const person = persons.find(p => p.sfPersonId === row.userId)
    if (!person) return []
    return [{
      id:                          `aff_a_${row.rowId}`,
      personId:                    person.id,
      positionId:                  `pos_a_${row.rowId}`,
      type:                        row.concurrentType === '兼務' ? 'concurrent' : 'primary',
      status:                      'active' as const,
      startDate:                   '2000-01-01',
      employmentType:              row.employmentType,
      concurrentReason:            row.concurrentReason,
      isOnLeave:                   row.leaveFlag === '○',
      individualBand:              row.band,
      salaryGrade:                 row.payGrade,
      freeTitle:                   row.localJobTitle,
      isNonUnionAgreement:         row.nonUnionAgreementFlag === '○',
      isUnionMember:               row.unionFlag === '○',
      isDiscretionaryLabor:        row.discretionaryWorkFlag === '○',
    }]
  })
}
