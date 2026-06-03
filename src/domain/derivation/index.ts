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
import type { AllCodeLists }  from '../codeLists/aggregate'
import type { DerivedUpdates } from './types'

import { deriveOrgSubFields }        from './orgFields'
import { deriveManagerName }         from './managerFields'
import { derivePromotionSign, derivePayGradeChangeSign } from './promotionFields'
import { deriveOnJobFamilyChange, derivePayGradeFromJobType } from './jobFields'

export { deriveOrgSubFields, reDeriveOrgSubFieldsForList, isSecondmentOrg, suggestSecondmentOrgCodes } from './orgFields'
export { deriveManagerName, reDeriveManagerNamesForList } from './managerFields'
export { derivePromotionSign, derivePayGradeChangeSign }  from './promotionFields'
export { computePayGrade }                                from './jobFields'
export type { DerivedUpdates, DerivationContext }         from './types'

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

  // band → promotionSign（前回バンドと比較）
  if ('band' in changes) {
    const prevBand  = draft.prevBand as string | undefined
    Object.assign(result, derivePromotionSign(changes.band, prevBand, codeLists))
  }

  // payGrade → payGradeChangeSign
  if ('payGrade' in changes) {
    const prevPg = draft.prevPayGrade as string | undefined
    Object.assign(result, derivePayGradeChangeSign(changes.payGrade, prevPg))
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

  return result
}
