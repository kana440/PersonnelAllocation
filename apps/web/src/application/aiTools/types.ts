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
