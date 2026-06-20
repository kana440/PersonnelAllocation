// 雇用タイプCD — AllocationList.employmentType / Affiliation.employmentType
import type { CodeEntry } from './types'

export interface EmploymentTypeEntry extends CodeEntry {
  isSecondmentAcceptance: boolean  // 出向受入チェック
  isRegularEmployee:      boolean  // 社員チェック
  isExtendedEmployee:     boolean  // 雇用延長チェック
}
