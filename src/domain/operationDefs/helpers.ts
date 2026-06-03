// 操作定義で共通して使うユーティリティ

import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists }  from '../codeLists/aggregate'

/** 雇用タイプエントリを label / code どちらでも引ける */
function findEmpType(row: AllocationRow, codeLists: AllCodeLists) {
  const v = row.employmentType as string | undefined
  if (!v) return undefined
  return codeLists.employmentTypes.find(e => e.label === v || e.code === v)
}

/** 社員（isRegularEmployee = true）かどうか */
export function isRegularEmployee(row: AllocationRow, codeLists: AllCodeLists): boolean {
  return findEmpType(row, codeLists)?.isRegularEmployee ?? false
}

/** 出向受入（isSecondmentAcceptance = true）かどうか */
export function isSecondmentAcceptance(row: AllocationRow, codeLists: AllCodeLists): boolean {
  return findEmpType(row, codeLists)?.isSecondmentAcceptance ?? false
}

/** 雇用延長ポジション対象（isExtendedEmployeePosition = true）かどうか */
export function isExtendedEmployeeTarget(row: AllocationRow, codeLists: AllCodeLists): boolean {
  const band = row.band as string | undefined
  if (!band) return false
  return codeLists.jobLevels.find(e => e.label === band)?.isExtendedEmployeePosition ?? false
}

/** 本務行かどうか（concurrentType が兼務でない） */
export function isMainAssignment(row: AllocationRow): boolean {
  return row.concurrentType !== '兼務'
}

/** 出向中（prevSecondmentToCompany が設定済み）かどうか */
export function wasSecondedOut(row: AllocationRow): boolean {
  return !!(row.prevSecondmentToCompany as string | undefined)
}

/** 出向受入中（prevSecondmentFromCompany が設定済み）かどうか */
export function wasSecondedIn(row: AllocationRow): boolean {
  return !!(row.prevSecondmentFromCompany as string | undefined)
}

/** 前の雇用タイプに「出向受入」が含まれるかどうか */
export function prevWasSecondmentIn(row: AllocationRow, codeLists: AllCodeLists): boolean {
  const prevEt = row.prevEmploymentType as string | undefined
  if (!prevEt) return false
  const entry = codeLists.employmentTypes.find(e => e.label === prevEt || e.code === prevEt)
  return entry?.isSecondmentAcceptance ?? false
}

/** SF統合済み会社かどうか（companyEntry の isSFIntegrated フラグで判定） */
export function isSFIntegratedCompany(companyLabel: string | undefined, codeLists: AllCodeLists): boolean {
  if (!companyLabel) return false
  return codeLists.companies.find(c => c.label === companyLabel || c.code === companyLabel)?.isSFIntegrated ?? false
}
