/**
 * 自動導出パイプライン — derivation/index.ts
 *
 * 変更フィールドから連動して自動設定すべきフィールドを計算して返す純粋関数。
 * 新しい導出ルールはここに追加するだけで、全変更パスに自動伝播する。
 * UndoStack への記録は行わない（呼び出し側が判断する）。
 *
 * 使い方:
 *   const extra = deriveFieldUpdates(changes, currentRow, masters, allocationList)
 *   const merged = { ...changes, ...extra }
 */

import type { AllocationRow } from '../allocationRow'
import type { AllMasters }  from '../masters/aggregate'
import type { DerivedUpdates } from './types'

import { deriveOrgSubFields }        from './orgFields'
import { deriveManagerName }         from './managerFields'
import { derivePromotionSign, derivePayGradeChangeSign, derivePromotionSignFromLevel } from './promotionFields'
import { deriveOnJobFamilyChange, derivePayGradeFromJobType } from './jobFields'
import { deriveDiscretionaryFlags } from './discretionaryFields'

export { deriveOrgSubFields, reDeriveOrgSubFieldsForList, isSecondmentOrg, suggestSecondmentOrgCodes } from './orgFields'
export { deriveManagerName, reDeriveManagerNamesForList } from './managerFields'
export { derivePromotionSign, derivePayGradeChangeSign, derivePromotionSignFromLevel, computeBandStepDiff, getBandsByStep } from './promotionFields'
export { computePayGrade }                                from './jobFields'
export type { DerivedUpdates, DerivationContext }         from './types'

/** 社員（isRegularEmployee = true）かどうか — 循環依存回避のため derivation 内でローカル定義 */
function isRegularEmp(row: AllocationRow, masters: AllMasters): boolean {
  const emp = row.employmentType as string | undefined
  if (!emp) return false
  const entry = masters.employmentTypes.find(e => e.label === emp || e.code === emp)
  return !!entry?.isRegularEmployee
}


/**
 * フィールド変更から連動する自動導出フィールドを計算する。
 * `changes` に含まれるフィールドをトリガーとしてルールを評価する。
 *
 * 連動ルール（優先順位順）:
 *   positionBand → band（社員かつ band が明示変更でない場合）→ 以降の band ルールに合流
 *   band → promotionSign + F2条件: positionBand を band に同期
 *   band + jobType → payGrade
 *   payGrade → payGradeChangeSign + Level由来 promotionSign
 *   positionBand / band / jobType → 裁量労働フラグの自動クリア（「はい」が許容されない場合に「いいえ」へ）
 */
export function deriveFieldUpdates(
  changes:        DerivedUpdates,
  currentRow:     AllocationRow,
  masters:      AllMasters,
  allocationList: readonly AllocationRow[] = [],
): DerivedUpdates {
  const draft = { ...currentRow, ...changes } as AllocationRow
  const result: DerivedUpdates = {}

  // positionBand → band（社員かつ band が明示変更でない場合に自動連動）
  // effectiveChanges を正規化することで後続の band 依存ルールがそのまま働く
  const effectiveChanges: DerivedUpdates = { ...changes }
  if ('positionBand' in changes && !('band' in changes) && isRegularEmp(draft, masters)) {
    effectiveChanges.band = changes.positionBand
    result.band = changes.positionBand  // positionBand → band を呼び出し側にも返す
  }

  // departmentCode → 組織サブフィールド群
  if ('departmentCode' in effectiveChanges && effectiveChanges.departmentCode) {
    Object.assign(result, deriveOrgSubFields(effectiveChanges.departmentCode, masters))
  }

  // managerPositionCode → managerName
  if ('managerPositionCode' in effectiveChanges) {
    result.managerName = deriveManagerName(effectiveChanges.managerPositionCode, allocationList)
  }

  // band → promotionSign（warningLevel 比較）
  if ('band' in effectiveChanges) {
    const prevBand = draft.prevBand as string | undefined
    Object.assign(result, derivePromotionSign(effectiveChanges.band, prevBand, masters))
  }

  // jobFamily → jobType / payGrade リセット
  if ('jobFamily' in effectiveChanges) {
    Object.assign(result, deriveOnJobFamilyChange())
  }

  // jobType または band → payGrade 再計算（jobFamily リセット後に上書きしない）
  const newJobType = ('jobType' in effectiveChanges ? effectiveChanges.jobType : draft.jobType) as string | undefined
  const newBand    = ('band'    in effectiveChanges ? effectiveChanges.band    : draft.band)    as string | undefined
  if (('jobType' in effectiveChanges || 'band' in effectiveChanges) && newJobType && newBand) {
    if (!('jobFamily' in effectiveChanges)) {
      Object.assign(result, derivePayGradeFromJobType(newJobType, newBand, masters))
    }
  }

  // payGrade（明示変更 or 導出済み）→ payGradeChangeSign + Level由来の promotionSign
  const effectivePg = ('payGrade' in result
    ? result.payGrade
    : 'payGrade' in effectiveChanges ? effectiveChanges.payGrade : undefined) as string | undefined

  if (effectivePg !== undefined) {
    const prevPg = draft.prevPayGrade as string | undefined
    Object.assign(result, derivePayGradeChangeSign(effectivePg, prevPg))
    // Level（数字部分）が変化した場合は promotionSign を上書き
    const lvSign = derivePromotionSignFromLevel(effectivePg, prevPg)
    if (lvSign.promotionSign !== undefined) {
      Object.assign(result, lvSign)
    }
  }

  // positionBand / band / jobType → 裁量労働フラグの自動クリア
  Object.assign(result, deriveDiscretionaryFlags(draft, effectiveChanges, masters))

  return result
}
