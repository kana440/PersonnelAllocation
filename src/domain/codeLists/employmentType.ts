// 雇用タイプCD — AllocationList.employmentType / Affiliation.employmentType
import type { CodeEntry } from './types'

export interface EmploymentTypeEntry extends CodeEntry {
  isOutsourceAcceptance:           boolean  // 出向受入チェック
  isEmployee:                      boolean  // 社員チェック
  isConcurrentOutsourceAcceptance: boolean  // 兼務出向受入チェック
  isEmploymentExtension:           boolean  // 雇用延長チェック
}
