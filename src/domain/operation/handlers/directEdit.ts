// DirectEdit — rewrites after-fields of a single AllocationRow.
// Used by RowEditorPanel (manual Excel-style row editing).
// Meaningful operation kinds (MoveToOrg, Promote, SendOnSecondment, ...)
// will be added as separate EditCommand implementations.

import type { AfterValues }    from '../../allocationRow'
import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, failField }       from '../types'

export class DirectEditOperation implements EditCommand {
  readonly kind = 'DirectEdit'

  constructor(
    private readonly rowId:   number,
    private readonly changes: AfterValues,
    private readonly label_:  string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return failField('rowId', `Row ${this.rowId} not found`)
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const updatedList = ctx.allocationList.map(r =>
      r.rowId === this.rowId ? { ...r, ...this.changes } : r
    )
    return { updatedList, label: this.label_ }
  }
}
