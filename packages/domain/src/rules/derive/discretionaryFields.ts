/**
 * 裁量労働フラグの自動クリア — derive/discretionaryFields.ts
 *
 * positionBand / band / jobType が変わった結果「はい」が許容されなくなった場合に
 * DISCRETIONARY_NO へ自動設定する。
 * 「はい」が許容される場合は現在値を維持する（自動で「はい」にはしない）。
 * → positionBand → band → payGrade の連動と同じ思想。
 */

import type { AllocationRow } from '../../allocationRow'
import type { AllMasters }    from '../../masters/aggregate'
import type { DerivedUpdates } from './types'
import { DISCRETIONARY_YES, DISCRETIONARY_NO } from '../../masters/discretionaryWork'

/** 組織コードから noDiscretionaryVMAutoCreate フラグを取得 */
function getNoAutoCreate(draft: AllocationRow, ms: AllMasters): boolean {
  const org = ms.orgMasterEntries.find(e => e.code === draft.departmentCode && e.phase === 'after')
           ?? ms.orgMasterEntries.find(e => e.code === draft.departmentCode)
  if (!org?.companyCode) return false
  return ms.companyFilters.find(f => f.code === org.companyCode)?.noDiscretionaryVMAutoCreate ?? false
}

/**
 * positionDiscretionaryWorkFlag / discretionaryWorkFlag の自動クリアを計算する。
 * @param draft            currentRow に changes をマージした状態
 * @param effectiveChanges 実際に変更されるフィールド群（positionBand→band の連動も含む）
 * @param masters          マスタデータ
 */
export function deriveDiscretionaryFlags(
  draft:            AllocationRow,
  effectiveChanges: DerivedUpdates,
  masters:          AllMasters,
): DerivedUpdates {
  const result: DerivedUpdates = {}

  const triggeredByPosBand = 'positionBand' in effectiveChanges
  const triggeredByBand    = 'band'         in effectiveChanges
  const triggeredByJobType = 'jobType'      in effectiveChanges

  if (!triggeredByPosBand && !triggeredByBand && !triggeredByJobType) return result

  const newPosBand = (effectiveChanges.positionBand ?? draft.positionBand) as string | undefined
  const newBand    = (effectiveChanges.band         ?? draft.band)         as string | undefined
  const newJobType = (effectiveChanges.jobType      ?? draft.jobType)      as string | undefined

  const noAutoCreate = getNoAutoCreate(draft, masters)
  const jobTypeEntry = masters.jobTypes.find(e => e.label === newJobType || e.code === newJobType)
  // jobType が不明な場合は強制クリアしない（マスタ未ロード時の誤クリア防止）
  const jobTypeAllows = jobTypeEntry ? !!jobTypeEntry.isDiscretionaryTarget : true

  // ── ポジション_裁量労働対象（positionBand と jobType に依存）────────────────
  if (triggeredByPosBand || triggeredByJobType) {
    const curFlag = draft.positionDiscretionaryWorkFlag as string | undefined
    if (curFlag === DISCRETIONARY_YES) {
      const posBandEntry = masters.jobLevels.find(e => e.label === newPosBand || e.code === newPosBand)
      const bandAllows = posBandEntry
        ? (posBandEntry.isDiscretionaryTarget === 1
          || (posBandEntry.isDiscretionaryTarget === 2 && !noAutoCreate))
        : true
      if (!bandAllows || !jobTypeAllows) {
        result.positionDiscretionaryWorkFlag = DISCRETIONARY_NO
      }
    }
  }

  // ── 裁量労働対象（band と jobType に依存）────────────────────────────────────
  if (triggeredByBand || triggeredByJobType) {
    const curFlag = draft.discretionaryWorkFlag as string | undefined
    if (curFlag === DISCRETIONARY_YES) {
      const bandEntry = masters.jobLevels.find(e => e.label === newBand || e.code === newBand)
      const bandAllows = bandEntry
        ? (bandEntry.isDiscretionaryTarget === 1
          || (bandEntry.isDiscretionaryTarget === 2 && !noAutoCreate))
        : true
      if (!bandAllows || !jobTypeAllows) {
        result.discretionaryWorkFlag = DISCRETIONARY_NO
      }
    }
  }

  return result
}
