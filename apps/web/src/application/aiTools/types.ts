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

/** buildOrgTree 内部で使う軽量な人物表現。orgTree.ts 専用。 */
export interface PersonSearchResult {
  userId:   string
  name:     string
  orgCode:  string
  orgName?: string
  rowIds:   number[]
}

/** findPersons の positions[] 要素。現在状態と変更前状態を両方含む。 */
export interface PersonPosition {
  rowId: number
  // 現在状態（after）— AllocationRow フィールド名と一致
  departmentCode?: string
  orgName?:        string
  positionCode?:   string
  localJobTitle?:  string
  concurrentType?: string
  secondmentToCompany?:   string
  secondmentFromCompany?: string
  // 変更前状態（prev）— filter のキーと対応
  prevDepartmentCode?: string
  prevOrgName?:        string
  prevPositionCode?:   string
  prevLocalJobTitle?:  string
  prevConcurrentType?: string
  prevSecondmentToCompany?:   string
  prevSecondmentFromCompany?: string
}

/** findPersons の戻り値。1人1エントリ、兼務は positions[] に複数。 */
export interface PersonResult {
  userId?:          string
  groupEmployeeId?: string
  employeeNumber?:  string
  name:             string
  positions:        PersonPosition[]
}

/** getPersonsDetail の戻り値。1 rowId につき 1 エントリ（全フィールド）。 */
export interface PersonRowDetail {
  rowId:            number
  name:             string
  userId?:          string
  groupEmployeeId?: string
  employeeNumber?:  string
  concurrentType?:  string
  // Organization
  departmentCode?:     string
  orgName?:            string
  prevDepartmentCode?: string
  prevOrgName?:        string
  // Person fields
  employmentType?:        string
  prevEmploymentType?:    string
  band?:                  string
  prevBand?:              string
  payGrade?:              string
  prevPayGrade?:          string
  leaveOfAbsenceSign?:    string
  // Position fields
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
  businessUnit?:              string
  division?:                  string
  subDivision?:               string
  group?:                     string
  team?:                      string
  // Allocation（出向・兼務）
  concurrentReason?:             string
  secondmentFromCompany?:        string
  prevSecondmentFromCompany?:    string
  secondmentToCompany?:          string
  prevSecondmentToCompany?:      string
  secondmentFromEmployeeNumber?: string
  // Transaction meta
  transferReason?:     string
  promotionSign?:      string
  demotionReason?:     string
  payGradeChangeSign?: string
  memo?:               string
}
