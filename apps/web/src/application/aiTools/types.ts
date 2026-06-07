import type { ValidationError } from '@personnel/domain/commands/types'
import type { ValidationIssue } from '@personnel/domain/validation/types'

export interface VacantPositionResult {
  rowId:         number
  positionCode:  string
  orgCode:       string
  orgName?:      string
  localJobTitle: string
}

/**
 * AI 書き込みツールの戻り値。
 * 操作が成功した場合は postValidation に影響行のバリデーション結果を含む。
 * 影響行に問題がなければ postValidation は空配列。
 */
export type AIOperationResult =
  | ValidationError
  | { ok: true; postValidation: Array<{ rowId: number; issues: ValidationIssue[] }> }

export interface PersonSearchResult {
  userId:   string
  name:     string
  orgCode:  string
  orgName?: string
  rowIds:   number[]
}

/** searchPersons の戻り値。1人につき1エントリ（本務行ベース）。 */
export interface PersonDetail {
  // ── Identity ──────────────────────────────────────────────────────────
  userId:             string
  name:               string
  primaryRowId:       number
  /** 兼務行の rowId 一覧（本務を除く）。空なら兼務なし。 */
  concurrentRowIds:   number[]

  // ── Organization ──────────────────────────────────────────────────────
  departmentCode?:    string
  orgName?:           string
  prevDepartmentCode?: string
  prevOrgName?:       string
  businessUnit?:      string
  division?:          string
  subDivision?:       string
  group?:             string
  team?:              string

  // ── Person fields ──────────────────────────────────────────────────────
  employmentType?:        string
  prevEmploymentType?:    string
  band?:                  string
  prevBand?:              string
  payGrade?:              string
  prevPayGrade?:          string
  leaveOfAbsenceSign?:    string
  prevLeaveOfAbsenceSign?: string

  // ── Position fields ────────────────────────────────────────────────────
  positionCode?:              string
  prevPositionCode?:          string
  officialPositionCode?:      string
  prevOfficialPositionCode?:  string
  localJobTitle?:             string
  prevLocalJobTitle?:         string
  positionBand?:              string
  managerPositionCode?:       string
  managerName?:               string
  location?:                  string
  costCenter?:                string
  jobFamily?:                 string
  jobType?:                   string

  // ── Allocation（出向・兼務）──────────────────────────────────────────────
  concurrentType?:                string
  concurrentReason?:              string
  secondmentFromCompany?:         string
  prevSecondmentFromCompany?:     string
  secondmentToCompany?:           string
  prevSecondmentToCompany?:       string
  secondmentFromEmployeeNumber?:  string

  // ── Transaction meta ───────────────────────────────────────────────────
  transferReason?:    string
  promotionSign?:     string
  demotionReason?:    string
  payGradeChangeSign?: string
  memo?:              string

  // ── Derived ────────────────────────────────────────────────────────────
  hasChanges:     boolean
  changeKinds:    string[]
  errorCount:     number
  warningCount:   number
}
