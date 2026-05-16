// 給与等級CD — AllocationList.payGrade / Affiliation.salaryGrade
import type { CodeEntry } from './types'

export interface PayGradeEntry extends CodeEntry {
  band?: string               // corresponding positionBand / jobLevel code
  compensationCategory?: string  // 報酬区分 (if grade implies a pay type)
  numericGrade?: number       // numeric rank for grade-change comparisons
}
