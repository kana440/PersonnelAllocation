// 雇用タイプCD — AllocationList.employmentType / Affiliation.employmentType
import type { CodeEntry } from './types'

export interface EmploymentTypeEntry extends CodeEntry {
  isDiscretionaryLaborTarget?: boolean  // 裁量対象サイン: drives discretionaryWorkFlag default
  compensationCategory?: string          // 報酬区分 (e.g. '月給', '年俸', '時給')
}
