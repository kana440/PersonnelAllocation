// AssignPositionCodesOperation — assigns real external codes to internally-numbered positions.
//
// When new positions are created with CreateVacantPositionOperation, they get a temporary
// "_pos_XXX" code. This operation replaces those temporary codes with official
// "P\d{8}" codes sourced from a number table (spreadsheet or future API).
//
// Cascade rule: any row whose managerPositionCode references the old "_pos_XXX" code is
// also updated so the report-line relationship is preserved.

import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { PositionCodeAssignment } from '../../../ports'

export class AssignPositionCodesOperation implements EditCommand {
  readonly kind = 'AssignPositionCodes'

  constructor(private readonly assignments: PositionCodeAssignment[]) {}

  validate(ctx: OperationContext): ValidationResult {
    if (this.assignments.length === 0) return fail('割り当てるポジションコードがありません')
    for (const { rowId, newPositionCode } of this.assignments) {
      const row = ctx.allocationList.find(r => r.rowId === rowId)
      if (!row)
        return fail(`行が見つかりません (rowId: ${rowId})`)
      if (!String(row.positionCode ?? '').startsWith('_pos_'))
        return fail(`内部採番コード以外は変更できません (rowId: ${rowId}, positionCode: ${String(row.positionCode)})`)
      if (!/^P\d{8}$/.test(newPositionCode))
        return fail(`無効なポジションコード形式: ${newPositionCode}（"P" + 8桁数字が必要）`)
      const duplicate = ctx.allocationList.find(
        r => r.rowId !== rowId && r.positionCode === newPositionCode
      )
      if (duplicate)
        return fail(`コード "${newPositionCode}" は既に使用されています (rowId: ${duplicate.rowId})`)
    }
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    // Build old-code → new-code map for O(1) cascade lookup
    const codeMap = new Map<string, string>()
    for (const { rowId, newPositionCode } of this.assignments) {
      const row = ctx.allocationList.find(r => r.rowId === rowId)!
      codeMap.set(String(row.positionCode), newPositionCode)
    }

    const updated = ctx.allocationList.map(row => {
      const updates: Record<string, string> = {}

      // Direct: this row's own positionCode is being assigned a real code
      const oldCode = String(row.positionCode ?? '')
      if (codeMap.has(oldCode)) {
        updates.positionCode = codeMap.get(oldCode)!
      }

      // Cascade: this row's managerPositionCode points to a code being reassigned
      const oldMgrCode = String(row.managerPositionCode ?? '')
      if (oldMgrCode && codeMap.has(oldMgrCode)) {
        updates.managerPositionCode = codeMap.get(oldMgrCode)!
      }

      return Object.keys(updates).length > 0 ? { ...row, ...updates } : row
    })

    return {
      updatedList: updated,
      label:       `ポジションコード割当 (${this.assignments.length}件)`,
    }
  }
}
