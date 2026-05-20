// DirectEdit — rewrites after-fields of a single AllocationRow.
// Used by RowEditorPanel (manual Excel-style row editing).
// Meaningful operation kinds (MoveToOrg, Promote, SendOnSecondment, ...)
// will be added as separate IDomainOperation implementations.

import type { AfterValues }    from '../../allocationRow'
import type { IDomainOperation, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, failField }       from '../types'
import { validateRow }         from '../../validation/validateRow'

export class DirectEditOperation implements IDomainOperation {
  readonly kind = 'DirectEdit'

  constructor(
    private readonly rowId:   number,
    private readonly changes: AfterValues,
    private readonly label_:  string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return failField('rowId', `Row ${this.rowId} not found`)

    const merged = { ...row, ...this.changes }
    const issues = validateRow(merged, ctx.afterOrganizations, ctx.codeLists)
    const errors = issues.filter(i => i.level === 'error')
    if (errors.length === 0) return ok()

    return {
      ok:     false,
      errors: errors.map(i => ({ field: String(i.field), message: i.message })),
    }
  }

  apply(ctx: OperationContext): OperationResult {
    const updatedList = ctx.allocationList.map(r =>
      r.rowId === this.rowId ? { ...r, ...this.changes } : r
    )
    return { updatedList, label: this.label_ }
  }
}
