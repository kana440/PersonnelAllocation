// MoveRowsToOrg — moves specific rows (by rowId) to a target organization.
// departmentCode (after) is updated; managerPositionCode is intentionally left unchanged.
// Use case: user selects individual people from the canvas and moves them to another org.

import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import { deriveOrgSubFields } from '../orgHelpers'

export class MoveRowsToOrgOperation implements EditCommand {
  readonly kind = 'MoveRowsToOrg'

  constructor(
    private readonly rowIds:    number[],   // specific rows to move
    private readonly targetOrgId: string,   // internal org ID
    private readonly label_:   string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (this.rowIds.length === 0) return fail('移動対象が選択されていません')

    const targetOrg = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)
    if (!targetOrg) return fail(`移動先組織が見つかりません (id: ${this.targetOrgId})`)
    if (!targetOrg.externalCode) return fail('移動先組織に組織コードが設定されていません')

    const missing = this.rowIds.filter(id => !ctx.allocationList.find(r => r.rowId === id))
    if (missing.length > 0) return fail(`行が見つかりません: ${missing.join(', ')}`)

    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const targetOrg  = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)!
    const targetCode = targetOrg.externalCode ?? ''
    const rowIdSet   = new Set(this.rowIds)

    const orgSubFields = deriveOrgSubFields(targetCode, ctx.masters)
    const updatedList = ctx.allocationList.map(r =>
      rowIdSet.has(r.rowId) ? { ...r, departmentCode: targetCode, ...orgSubFields } : r
    )

    return { updatedList, label: this.label_ }
  }
}
