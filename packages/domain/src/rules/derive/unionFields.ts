/**
 * 労働組合員フラグの自動クリア — derive/unionFields.ts
 *
 * band / positionBand が変わった結果「非組合員のみ」が許容になった場合に
 * NON_MEMBER へ自動設定する。
 * 組合員が許容される状態に戻った場合は現在値を維持する（自動で組合員にはしない）。
 * → discretionaryFields.ts と同じ思想（クリア方向のみ確実に適用）。
 */

import type { AllocationRow } from '../../allocationRow'
import type { AllMasters }    from '../../masters/aggregate'
import type { DerivedUpdates } from './types'
import { UNION_MEMBER_CODE } from '../../masters/unionMember'

function findEmpType(draft: AllocationRow, ms: AllMasters) {
  const v = draft.employmentType as string | undefined
  if (!v) return undefined
  return ms.employmentTypes.find(e => e.label === v || e.code === v)
}

/**
 * positionUnionFlag / unionFlag の自動クリアを計算する。
 * @param draft            currentRow に changes をマージした状態
 * @param effectiveChanges 実際に変更されるフィールド群（positionBand→band の連動も含む）
 * @param masters          マスタデータ
 */
export function deriveUnionFlags(
  draft:            AllocationRow,
  effectiveChanges: DerivedUpdates,
  masters:          AllMasters,
): DerivedUpdates {
  const result: DerivedUpdates = {}
  const emp = findEmpType(draft, masters)
  if (!emp) return result

  // ── positionUnionFlag（positionBand に依存）────────────────────────────────
  if ('positionBand' in effectiveChanges) {
    const newPosBand = (effectiveChanges.positionBand ?? draft.positionBand) as string | undefined
    const posEntry   = masters.jobLevels.find(e => e.label === newPosBand || e.code === newPosBand)
    if (posEntry) {
      // F1/F2: 出向受入 or 正社員（SF社員）→ isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
      const isF1F2 = emp.isSecondmentAcceptance
                  || (emp.isRegularEmployee && !!draft.userId && draft.userId === draft.groupEmployeeId)
      // F3: 雇用延長 → isExtendedEmployeeUnionMember=false なら非組合員のみ
      const isF3   = emp.isExtendedEmployee

      const onlyNonMember =
        (isF1F2 && !posEntry.isRegularEmployeeOrSecondmentAcceptance) ||
        (isF3   && !posEntry.isExtendedEmployeeUnionMember)

      if (onlyNonMember
          && (draft.positionUnionFlag as string | undefined) !== UNION_MEMBER_CODE.NON_MEMBER) {
        result.positionUnionFlag = UNION_MEMBER_CODE.NON_MEMBER
      }
    }
  }

  // ── unionFlag（band に依存）──────────────────────────────────────────────
  if ('band' in effectiveChanges) {
    const newBand  = (effectiveChanges.band ?? draft.band) as string | undefined
    const bandEntry = masters.jobLevels.find(e => e.label === newBand || e.code === newBand)
    if (bandEntry) {
      // F1: 出向受入 → 常に非組合員
      const onlyNonMember =
        emp.isSecondmentAcceptance ||
        // F2: 正社員（SF社員）→ isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
        (emp.isRegularEmployee && !!draft.userId && draft.userId === draft.groupEmployeeId
          && !bandEntry.isRegularEmployeeOrSecondmentAcceptance) ||
        // F3: 雇用延長 → isExtendedEmployeeUnionMember=false なら非組合員のみ
        (emp.isExtendedEmployee && !bandEntry.isExtendedEmployeeUnionMember)

      if (onlyNonMember
          && (draft.unionFlag as string | undefined) !== UNION_MEMBER_CODE.NON_MEMBER) {
        result.unionFlag = UNION_MEMBER_CODE.NON_MEMBER
      }
    }
  }

  return result
}
