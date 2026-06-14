// 職務情報系の変更検知: band昇降格・役職変更・ジョブタイプ・雇用延長
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'
import { parseBandLevel } from './helpers'

export function detectJobClassification(
  row: AllocationRow,
  jobLevelWarningMap?: Map<string, number>,
): Set<EditPattern> {
  const out = new Set<EditPattern>()

  const bandChanged    = (row.prevBand         ?? '') !== (row.band         ?? '')
  const posBandChanged = (row.prevPositionBand ?? '') !== (row.positionBand ?? '')

  if (bandChanged || posBandChanged) {
    const prevLevel  = parseBandLevel(row.prevBand)
    const afterLevel = parseBandLevel(row.band)

    if (bandChanged && prevLevel !== null && afterLevel !== null) {
      if      (afterLevel > prevLevel) out.add('promotion')
      else if (afterLevel < prevLevel) out.add('demotion')
      else                             out.add('titleChange')
    } else if (posBandChanged && jobLevelWarningMap) {
      const prev  = jobLevelWarningMap.get(row.prevPositionBand ?? '')
      const after = jobLevelWarningMap.get(row.positionBand     ?? '')
      if (prev !== undefined && after !== undefined) {
        if      (after > prev) out.add('promotion')
        else if (after < prev) out.add('demotion')
        else                   out.add('titleChange')
      } else {
        out.add('titleChange')
      }
    } else {
      out.add('titleChange')
    }
  }

  // localJobTitle 変更（昇降格なしの場合のみ titleChange を追加）
  if (
    (row.localJobTitle ?? '') !== (row.prevLocalJobTitle ?? '') &&
    !out.has('promotion') && !out.has('demotion')
  ) {
    out.add('titleChange')
  }

  // jobFamily / jobType 変更
  if (
    (row.jobFamily ?? '') !== (row.prevJobFamily ?? '') ||
    (row.jobType   ?? '') !== (row.prevJobType   ?? '')
  ) {
    out.add('jobTypeChange')
  }

  // 雇用延長: 同組織内の雇用タイプ変更（双方に値あり）
  const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
  const afterEt = (row.employmentType     as string | undefined) ?? ''
  if (
    prevEt && afterEt && prevEt !== afterEt &&
    (row.departmentCode ?? '') === (row.prevDepartmentCode ?? '')
  ) {
    out.add('employmentExtension')
  }

  return out
}
