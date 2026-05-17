// 給与等級CD — AllocationList.payGrade / Affiliation.salaryGrade
import type { CodeEntry } from './types'

export interface PayGradeEntry extends CodeEntry {
  compensationCategory?:  string   // 給与等級報酬区分 (X, Y など)
  band?:                  string   // 給与等級バンド (兼務・出向受入行は空)
  isOutsourceAcceptance:  boolean  // 出向受入チェック
  isEmployee:             boolean  // 社員チェック
  isEmploymentExtension:  boolean  // 雇用延長チェック
  isConcurrent:           boolean  // 兼務チェック
  isPayGradeChangeSign:   boolean  // 給与等級変更サイン
}
