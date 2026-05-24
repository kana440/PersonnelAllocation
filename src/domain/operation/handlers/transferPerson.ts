// TransferPersonOperation — moves a single person to a target organization atomically.
// Creates a new position in the target org, inherits position attributes from the source,
// and sets managerPositionCode to the top position of the target org.
// This is a single undo entry; use instead of the multi-step createPosition→assign sequence.

import type { IDomainOperation, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'

export class TransferPersonOperation implements IDomainOperation {
  readonly kind = 'TransferPerson'

  constructor(
    private readonly sourceRowId:     number,
    private readonly targetOrgId:     string,
    private readonly retireOriginal:  boolean,
    private readonly overrideFields?: Partial<AllocationRow>,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!row.userId) return fail('この行には人が配属されていません')

    const targetOrg = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)
    if (!targetOrg)             return fail(`移動先組織が見つかりません (id: ${this.targetOrgId})`)
    if (!targetOrg.externalCode) return fail('移動先組織に組織コードが設定されていません')

    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const sourceRow  = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const targetOrg  = ctx.afterOrganizations.find(o => o.id === this.targetOrgId)!
    const targetCode = targetOrg.externalCode ?? ''

    // Find the top position in the target org for the default report line
    const targetRows   = ctx.allocationList.filter(r => r.departmentCode === targetCode && !!r.positionCode)
    const targetPosSet = new Set(targetRows.map(r => r.positionCode).filter(Boolean))
    const topRow       = targetRows.find(r => !r.managerPositionCode || !targetPosSet.has(r.managerPositionCode))

    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const newRowId    = nextRowId(ctx.allocationList)

    const newRow: AllocationRow = {
      ...sourceRow,
      rowId:               newRowId,
      positionCode:        `_pos_${newRowId}`,
      departmentCode:      targetCode,
      managerPositionCode: topRow?.positionCode,
      ...allocClears,
      ...(this.overrideFields ?? {}),
    }

    const personName = `${sourceRow.lastName ?? ''}${sourceRow.firstName ?? ''}`
    const hasPosition = !!sourceRow.positionCode

    let updatedList: AllocationRow[]

    if (!hasPosition || this.retireOriginal) {
      // No old position to keep (unassigned person, or user chose to retire it)
      updatedList = [...ctx.allocationList.filter(r => r.rowId !== this.sourceRowId), newRow]
    } else {
      // Vacate the old position (clear person fields)
      const personClears = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
      const vacantSource: AllocationRow = {
        ...sourceRow,
        userId: undefined,
        ...personClears,
        ...allocClears,
      }
      updatedList = [
        ...ctx.allocationList.map(r => r.rowId === this.sourceRowId ? vacantSource : r),
        newRow,
      ]
    }

    return {
      updatedList,
      label: `異動: ${personName} → ${targetOrg.name}`,
    }
  }
}
