// BulkMoveToOrg — moves all members of a source org to a target org.
// Only departmentCode (after) is updated; managerPositionCode is intentionally left unchanged.
// Use case: org renaming / restructuring where all members move together as a unit.

import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import { deriveOrgSubFields } from '../orgHelpers'

export class BulkMoveToOrgOperation implements EditCommand {
  readonly kind = 'BulkMoveToOrg'

  constructor(
    private readonly sourceOrgId: string,  // internal org ID (before move)
    private readonly targetOrgId: string,  // internal org ID (after move)
    private readonly label_: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const sourceOrg = ctx.afterOrganizations.find(o => o.id === this.sourceOrgId)
    if (!sourceOrg) return fail(`移動元組織が見つかりません (id: ${this.sourceOrgId})`)

    const targetOrg = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)
    if (!targetOrg) return fail(`移動先組織が見つかりません (id: ${this.targetOrgId})`)

    if (this.sourceOrgId === this.targetOrgId) return fail('移動元と移動先が同じ組織です')

    const sourceCode = sourceOrg.externalCode
    if (!sourceCode) return fail('移動元組織に組織コードが設定されていません')

    const members = ctx.allocationList.filter(r => r.departmentCode === sourceCode)
    if (members.length === 0) return fail('移動元組織にメンバーがいません')

    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const sourceOrg  = ctx.afterOrganizations.find(o => o.id === this.sourceOrgId)!
    const targetOrg  = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)!
    const sourceCode = sourceOrg.externalCode!
    const targetCode = targetOrg.externalCode ?? ''

    const orgSubFields = deriveOrgSubFields(targetCode, ctx.masters)
    const updatedList = ctx.allocationList.map(r =>
      r.departmentCode === sourceCode
        ? { ...r, departmentCode: targetCode, ...orgSubFields }
        : r
    )

    return { updatedList, label: this.label_ }
  }
}
