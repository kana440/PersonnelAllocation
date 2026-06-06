/**
 * 自動導出パイプライン — derivation/index.ts
 *
 * 変更フィールドから連動して自動設定すべきフィールドを計算して返す純粋関数。
 * 新しい導出ルールはここに追加するだけで、全変更パスに自動伝播する。
 * UndoStack への記録は行わない（呼び出し側が判断する）。
 *
 * 使い方:
 *   const extra = deriveFieldUpdates(changes, currentRow, codeLists, allocationList)
 *   const merged = { ...changes, ...extra }
 */

import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists }  from '../masters/aggregate'
import type { DerivedUpdates } from './types'

import { deriveOrgSubFields }        from './orgFields'
import { deriveManagerName }         from './managerFields'
import { derivePromotionSign, derivePayGradeChangeSign, derivePromotionSignFromLevel } from './promotionFields'
import { deriveOnJobFamilyChange, derivePayGradeFromJobType } from './jobFields'

export { deriveOrgSubFields, reDeriveOrgSubFieldsForList, isSecondmentOrg, suggestSecondmentOrgCodes } from './orgFields'
export { deriveManagerName, reDeriveManagerNamesForList } from './managerFields'
export { derivePromotionSign, derivePayGradeChangeSign, derivePromotionSignFromLevel } from './promotionFields'
export { computePayGrade }                                from './jobFields'
export type { DerivedUpdates, DerivationContext }         from './types'

/** F2 条件: 雇用タイプが社員 かつ userId === groupEmployeeId（本籍行）*/
function isF2Primary(row: AllocationRow, codeLists: AllCodeLists): boolean {
  const emp = row.employmentType as string | undefined
  if (!emp) return false
  const entry = codeLists.employmentTypes.find(e => e.label === emp || e.code === emp)
  return !!entry?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId
}

/**
 * フィールド変更から連動する自動導出フィールドを計算する。
 * `changes` に含まれるフィールドをトリガーとしてルールを評価する。
 */
export function deriveFieldUpdates(
  changes:        DerivedUpdates,
  currentRow:     AllocationRow,
  codeLists:      AllCodeLists,
  allocationList: readonly AllocationRow[] = [],
): DerivedUpdates {
  const draft = { ...currentRow, ...changes } as AllocationRow
  const result: DerivedUpdates = {}

  // departmentCode → 組織サブフィールド群
  if ('departmentCode' in changes && changes.departmentCode) {
    Object.assign(result, deriveOrgSubFields(changes.departmentCode, codeLists))
  }

  // managerPositionCode → managerName
  if ('managerPositionCode' in changes) {
    result.managerName = deriveManagerName(changes.managerPositionCode, allocationList)
  }

  // band → promotionSign（warningLevel 比較）+ F2条件: positionBand を band と同期
  if ('band' in changes) {
    const prevBand = draft.prevBand as string | undefined
    Object.assign(result, derivePromotionSign(changes.band, prevBand, codeLists))
    if (isF2Primary(draft, codeLists)) {
      result.positionBand = changes.band
    }
  }

  // jobFamily → jobType / payGrade リセット
  if ('jobFamily' in changes) {
    Object.assign(result, deriveOnJobFamilyChange())
  }

  // jobType または band → payGrade 再計算（jobFamily リセット後に上書きしない）
  const newJobType = ('jobType' in changes ? changes.jobType : draft.jobType) as string | undefined
  const newBand    = ('band'    in changes ? changes.band    : draft.band)    as string | undefined
  if (('jobType' in changes || 'band' in changes) && newJobType && newBand) {
    if (!('jobFamily' in changes)) {
      Object.assign(result, derivePayGradeFromJobType(newJobType, newBand, codeLists))
    }
  }

  // payGrade（明示変更 or 導出済み）→ payGradeChangeSign + Level由来の promotionSign
  const effectivePg = ('payGrade' in result
    ? result.payGrade
    : 'payGrade' in changes ? changes.payGrade : undefined) as string | undefined

  if (effectivePg !== undefined) {
    const prevPg = draft.prevPayGrade as string | undefined
    Object.assign(result, derivePayGradeChangeSign(effectivePg, prevPg))
    // Level（数字部分）が変化した場合は promotionSign を上書き
    const lvSign = derivePromotionSignFromLevel(effectivePg, prevPg)
    if (lvSign.promotionSign !== undefined) {
      Object.assign(result, lvSign)
    }
  }

  return result
}
