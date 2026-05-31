import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok } from '../types'

export class BulkSetAssigneeOperation implements EditCommand {
  readonly kind = 'BulkSetAssigneeOperation'

  constructor(private readonly assignments: ReadonlyMap<number, string>) {}

  validate(_ctx: OperationContext): ValidationResult {
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const updatedList = ctx.allocationList.map(r => {
      const assignee = this.assignments.get(r.rowId)
      if (assignee === undefined) return r
      return { ...r, assignee: assignee || undefined }
    })
    const count = [...this.assignments.values()].filter(v => v !== '').length
    return { updatedList, label: `担当者を一括設定（${count}行）` }
  }
}
