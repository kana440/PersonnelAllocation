// ResetToBeforeOperation — resets all after fields to their before counterparts.
// Use case: undo an accidental org assignment made via SETUP/unmapped section.
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import { FIELD_METADATA } from '../../allocationRow'

export class ResetToBeforeOperation implements EditCommand {
  readonly kind = 'ResetToBefore'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const reset: Partial<typeof row> = {}
    for (const { after, before } of FIELD_METADATA) {
      ;(reset as Record<string, unknown>)[after] = row[before as keyof typeof row]
    }
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === this.rowId ? { ...r, ...reset } : r),
      label:       `組織割当リセット: ${name}`,
    }
  }
}
