import type { AllMasters }  from '../../masters/aggregate'
import type { DerivedUpdates } from './types'

/** jobType + band → payGrade を導出する（昇降格判定読み替えバンド × 報酬区分） */
export function computePayGrade(
  jobTypeLabel: string | undefined,
  bandLabel:    string | undefined,
  masters:    AllMasters,
): string | undefined {
  if (!jobTypeLabel || !bandLabel) return undefined
  const sub = masters.jobTypes.find(s => s.label === jobTypeLabel)
  if (!sub?.compensationCategory) return undefined
  // バンドから昇降格判定読み替えバンドを取得（なければバンドラベル自体を使用）
  const jobLevel    = masters.jobLevels.find(e => e.label === bandLabel)
  const gradingBand = jobLevel?.promotionDemotionBand ?? bandLabel
  return masters.payGrades.find(
    p => p.compensationCategory === sub.compensationCategory && p.band === gradingBand
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
  masters:    AllMasters,
): DerivedUpdates {
  const pg = computePayGrade(jobTypeLabel, bandLabel, masters)
  return pg !== undefined ? { payGrade: pg } : {}
}
