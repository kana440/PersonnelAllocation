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

/**
 * 既存の _pos_ 番号と重複しない新しいポジションコードを生成する。
 * positionCode/prevPositionCode 両方を参照して番号衝突を防ぐ。
 */
function nextPosCode(allocationList: readonly AllocationRow[]): string {
  const usedNums = new Set(
    allocationList.flatMap(r => [r.positionCode, r.prevPositionCode])
      .filter((c): c is string => typeof c === 'string' && c.startsWith('_pos_'))
      .map(c => parseInt(c.slice(5), 10)).filter(n => !isNaN(n))
  )
  let n = allocationList.length + 1
  while (usedNums.has(n)) n++
  return `_pos_${n}`
}

import { deriveOrgSubFields }        from './orgFields'
import { deriveManagerName }         from './managerFields'
import { derivePromotionSign, derivePayGradeChangeSign, derivePromotionSignFromLevel } from './promotionFields'
import { deriveOnJobFamilyChange, derivePayGradeFromJobType } from './jobFields'
import { deriveDiscretionaryFlags } from './discretionaryFields'
import { deriveUnionFlags }         from './unionFields'
import type { FieldStrictness }     from '../optionStrictness'
import { resolveFieldStrictness }   from '../optionStrictness'

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
  changes:             DerivedUpdates,
  currentRow:          AllocationRow,
  masters:           AllMasters,
  allocationList:      readonly AllocationRow[] = [],
  strictnessOverrides?: Partial<Record<string, FieldStrictness>>,
): DerivedUpdates {
  const draft = { ...currentRow, ...changes } as AllocationRow
  const result: DerivedUpdates = {}

  // positionBand → band（社員かつ band が明示変更でない場合に自動連動）
  // band が 'free' のときはユーザーが独立制御したいので連動をスキップ
  const effectiveChanges: DerivedUpdates = { ...changes }
  if ('positionBand' in changes && !('band' in changes) && isRegularEmp(draft, masters)) {
    if (resolveFieldStrictness('band', strictnessOverrides ?? {}) !== 'free') {
      effectiveChanges.band = changes.positionBand
      result.band = changes.positionBand  // positionBand → band を呼び出し側にも返す
    }
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

    // 給与等級変化 + ポジションコード未変更 → ポジションコードを自動新設
    // 「ポジションコード未変更」= 現在の positionCode が prevPositionCode と同じ
    //   （フォーム上でまだ変更されていない状態を示す）
    const currPos = draft.positionCode     as string | undefined
    const prevPos = draft.prevPositionCode as string | undefined
    if (prevPos) {  // 既存ポジションを持つ行のみ対象
      if (effectivePg !== prevPg && currPos === prevPos) {
        // payGrade が変化した → 新規 _pos_ コードを自動採番
        result.positionCode = nextPosCode(allocationList)
      } else if (effectivePg === prevPg && currPos !== prevPos &&
                 typeof currPos === 'string' && currPos.startsWith('_pos_')) {
        // payGrade が元に戻った + 自動採番コードが残っている → prevPositionCode に戻す
        result.positionCode = prevPos
      }
    }
  }

  // positionBand / band / jobType → 裁量労働フラグの自動クリア（'free' 時はスキップ）
  Object.assign(result, deriveDiscretionaryFlags(draft, effectiveChanges, masters, strictnessOverrides))

  // positionBand / band → 労働組合員フラグの自動クリア（'free' 時はスキップ）
  Object.assign(result, deriveUnionFlags(draft, effectiveChanges, masters, strictnessOverrides))

  return result
}
