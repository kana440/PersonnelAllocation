// 操作定義で共通して使うユーティリティ

import type { AllocationRow } from '../allocationRow'
import type { AllMasters }  from '../masters/aggregate'
import type { Organization } from '../schemas'

/** 雇用タイプエントリを label / code どちらでも引ける */
function findEmpType(row: AllocationRow, masters: AllMasters) {
  const v = row.employmentType as string | undefined
  if (!v) return undefined
  return masters.employmentTypes.find(e => e.label === v || e.code === v)
}

/** 社員（isRegularEmployee = true）かどうか */
export function isRegularEmployee(row: AllocationRow, masters: AllMasters): boolean {
  return findEmpType(row, masters)?.isRegularEmployee ?? false
}

/** 出向受入（isSecondmentAcceptance = true）かどうか */
export function isSecondmentAcceptance(row: AllocationRow, masters: AllMasters): boolean {
  return findEmpType(row, masters)?.isSecondmentAcceptance ?? false
}

/** 雇用延長ポジション対象（isExtendedEmployeePosition = true）かどうか */
export function isExtendedEmployeeTarget(row: AllocationRow, masters: AllMasters): boolean {
  const band = row.band as string | undefined
  if (!band) return false
  return masters.jobLevels.find(e => e.label === band)?.isExtendedEmployeePosition ?? false
}

/** 本務行かどうか（concurrentType === '本務' または未設定） */
export function isMainAssignment(row: AllocationRow): boolean {
  const ct = row.concurrentType as string | undefined
  return ct === '本務' || !ct
}

/** 出向中（prevSecondmentToCompany が設定済み）かどうか */
export function wasSecondedOut(row: AllocationRow): boolean {
  return !!(row.prevSecondmentToCompany as string | undefined)
}

/** 出向受入中（prevSecondmentFromCompany が設定済み）かどうか */
export function wasSecondedIn(row: AllocationRow): boolean {
  return !!(row.prevSecondmentFromCompany as string | undefined)
}

/** このセッションで新規追加された行かどうか（インポート行は必ず prevEmploymentType が入る） */
export function isNewRow(row: AllocationRow): boolean {
  return !(row.prevEmploymentType as string | undefined)
}

/** 前の雇用タイプに「出向受入」が含まれるかどうか */
export function prevWasSecondmentIn(row: AllocationRow, masters: AllMasters): boolean {
  const prevEt = row.prevEmploymentType as string | undefined
  if (!prevEt) return false
  const entry = masters.employmentTypes.find(e => e.label === prevEt || e.code === prevEt)
  return entry?.isSecondmentAcceptance ?? false
}

/** SF統合済み会社かどうか（companyEntry の isSFIntegrated フラグで判定） */
export function isSFIntegratedCompany(companyLabel: string | undefined, masters: AllMasters): boolean {
  if (!companyLabel) return false
  return masters.companies.find(c => c.label === companyLabel || c.code === companyLabel)?.isSFIntegrated ?? false
}

/**
 * 本務出向先の出向者用組織コードを自動導出する。
 *
 * 現在の departmentCode から親を辿り、各祖先の直接の子の中に
 * orgCategory が '出向者用組織' の org を探して返す。
 * ルートまで遡っても見つからない場合は undefined（フォームでブランク表示・手入力）。
 */
export function findSecondmentOrgCode(
  currentDeptCode: string,
  afterOrgs: Organization[],
  masters: AllMasters,
): string | undefined {
  const secondmentOrgCodes = new Set(
    masters.orgMasterEntries
      .filter(e => e.orgCategory?.includes('出向者用組織') && e.phase === 'after')
      .map(e => e.code),
  )

  let org = afterOrgs.find(o => o.externalCode === currentDeptCode)
  if (!org) return undefined

  while (org.parentId) {
    const pid: string = org.parentId
    const found = afterOrgs.find(
      o => o.parentId === pid && !!o.externalCode && secondmentOrgCodes.has(o.externalCode),
    )
    if (found?.externalCode) return found.externalCode
    org = afterOrgs.find(o => o.id === pid)
    if (!org) return undefined
  }

  return undefined
}

/**
 * 本務出向解除時の戻り先組織コードを推定する。
 *
 * 出向前の上司ポジション（prevManagerPositionCode）を持つ行を探し、
 * その上司の現在組織と prev 組織が一致する（＝上司が動いていない）場合に限り提案する。
 * 不一致・情報なしの場合は undefined（フォームでブランク・手入力）。
 */
export function findReturnOrgCode(
  row: AllocationRow,
  allocationList: AllocationRow[],
): string | undefined {
  const managerPosCode = row.prevManagerPositionCode as string | undefined
  if (!managerPosCode) return undefined
  const mgr = allocationList.find(r => r.positionCode === managerPosCode)
  if (!mgr) return undefined
  const mgrCurrent = mgr.departmentCode    as string | undefined
  const mgrPrev    = mgr.prevDepartmentCode as string | undefined
  // 上司の組織がインポート前から変わっていなければ安全に提案できる
  return mgrCurrent && mgrCurrent === mgrPrev ? mgrCurrent : undefined
}

/**
 * 指定ポジションの配下にあるポジションコードを BFS で列挙する。
 * 上司変更時のループ防止（自分の配下を上司に選べないようにする）に使用する。
 */
export function getDescendantPositionCodes(
  positionCode: string,
  allocationList: AllocationRow[],
): Set<string> {
  const result = new Set<string>()
  const queue  = [positionCode]
  while (queue.length > 0) {
    const pc = queue.shift()!
    for (const row of allocationList) {
      const rpc = row.positionCode as string | undefined
      if (row.managerPositionCode === pc && rpc && !result.has(rpc)) {
        result.add(rpc)
        queue.push(rpc)
      }
    }
  }
  return result
}
