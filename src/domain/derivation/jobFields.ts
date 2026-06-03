import type { AllCodeLists }  from '../masters/aggregate'
import type { DerivedUpdates } from './types'

/** jobType + band → payGrade を導出する（compensationCategory 経由） */
export function computePayGrade(
  jobTypeLabel: string | undefined,
  bandLabel:    string | undefined,
  codeLists:    AllCodeLists,
): string | undefined {
  if (!jobTypeLabel || !bandLabel) return undefined
  const sub = codeLists.jobTypes.find(s => s.label === jobTypeLabel)
  if (!sub?.compensationCategory) return undefined
  return codeLists.payGrades.find(
    p => p.compensationCategory === sub.compensationCategory && p.band === bandLabel
  )?.label
}

/** jobFamily 変更時: jobType / payGrade をリセット */
export function deriveOnJobFamilyChange(): DerivedUpdates {
  return { jobType: undefined, payGrade: undefined }
}

/** jobType または band 変更時: payGrade を再計算 */
export function derivePayGradeFromJobType(
  jobTypeLabel: string | undefined,
  bandLabel:    string | undefined,
  codeLists:    AllCodeLists,
): DerivedUpdates {
  const pg = computePayGrade(jobTypeLabel, bandLabel, codeLists)
  return pg !== undefined ? { payGrade: pg } : {}
}
