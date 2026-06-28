// Position operations — create, remove, assign, unassign.
// Each class implements EditCommand: validate() checks preconditions,
// apply() returns the new state as a pure transformation.

import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields, deriveManagerName } from '../orgHelpers'
import { vacatePosition, assignPersonToVacant } from '../defs/positionVacant'

// ── CreateVacantPosition ─────────────────────────────────────────────────────

export class CreateVacantPositionOperation implements EditCommand {
  readonly kind = 'CreateVacantPosition'

  constructor(
    private readonly departmentCode: string,
    private readonly localJobTitle:  string,
    private readonly extraFields?:   Partial<AllocationRow>,
  ) {}

  validate(_ctx: DomainContext): ValidationResult {
    if (!this.departmentCode) return fail('部門コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const rowId = nextRowId(ctx.allocationList)
    const newRow: AllocationRow = {
      rowId,
      departmentCode: this.departmentCode,
      ...deriveOrgSubFields(this.departmentCode, ctx.masters),
      localJobTitle:  this.localJobTitle,
      positionCode:   `_pos_${rowId}`,
      ...(this.extraFields ?? {}),
    } as AllocationRow
    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `空席ポジション作成: ${this.localJobTitle || '(未設定)'}`,
    }
  }
}

// ── RemovePosition ───────────────────────────────────────────────────────────

export class RemovePositionOperation implements EditCommand {
  readonly kind = 'RemovePosition'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)            return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.positionCode) return fail('ポジションコードがありません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const label = `ポジション削除: ${row.localJobTitle ?? row.positionCode}`

    if (row.userId) {
      // 在席中: ポジション行を削除し、人を未アサイン行に残す
      const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
      const unassignedRow: AllocationRow = {
        ...row,
        rowId: nextRowId(ctx.allocationList),
        ...positionClears,
      }
      return {
        updatedList: [...ctx.allocationList.filter(r => r.rowId !== this.rowId), unassignedRow],
        label,
      }
    }

    // 空席: そのまま削除
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== this.rowId),
      label,
    }
  }
}

// ── UnassignPersonFromPosition ───────────────────────────────────────────────

export class UnassignPersonFromPositionOperation implements EditCommand {
  readonly kind = 'UnassignPersonFromPosition'

  constructor(private readonly occupiedRowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.occupiedRowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.occupiedRowId})`)
    if (!row.userId)   return fail('この行には人が配属されていません')
    if (!row.positionCode) return fail('ポジションコードがありません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.occupiedRowId)!

    const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))

    const vacatedRow    = vacatePosition(row)  // 空席ポジション（人フィールドをクリア）
    const unassignedRow: AllocationRow = {
      ...row,
      rowId: nextRowId([...ctx.allocationList, vacatedRow]),
      ...positionClears,
    }

    const hasOtherRowInOrg = ctx.allocationList.some(
      r => r.rowId !== this.occupiedRowId && r.userId === row.userId && r.departmentCode === row.departmentCode
    )

    const updated = ctx.allocationList.map(r => r.rowId === this.occupiedRowId ? vacatedRow : r)
    return {
      updatedList: hasOtherRowInOrg ? updated : [...updated, unassignedRow],
      label: `アサイン解除: ${row.lastName ?? ''}${row.firstName ?? ''}`,
    }
  }
}

// ── SetPositionManager ───────────────────────────────────────────────────────

export class SetPositionManagerOperation implements EditCommand {
  readonly kind = 'SetPositionManager'

  constructor(
    private readonly rowId:               number,
    private readonly managerPositionCode: string | undefined,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row         = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const managerName = deriveManagerName(this.managerPositionCode, ctx.allocationList)
    const label = this.managerPositionCode
      ? `上司設定: ${row.localJobTitle ?? row.positionCode ?? ''}`
      : `上司解除: ${row.localJobTitle ?? row.positionCode ?? ''}`
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, managerPositionCode: this.managerPositionCode, managerName }
          : r
      ),
      label,
    }
  }
}

// ── AssignPersonToPosition ───────────────────────────────────────────────────

export class AssignPersonToPositionOperation implements EditCommand {
  readonly kind = 'AssignPersonToPosition'

  constructor(
    private readonly vacantRowId:       number,
    private readonly personSfId:        string,
    private readonly leaveSourceVacant: boolean = false,
    private readonly overrideBand?:     boolean,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const vacantRow = ctx.allocationList.find(r => r.rowId === this.vacantRowId)
    if (!vacantRow)          return fail(`行が見つかりません (rowId: ${this.vacantRowId})`)
    if (vacantRow.userId)    return fail('このポジションは既に在席中です')
    if (!vacantRow.positionCode) return fail('ポジションコードがありません')
    if (!this.personSfId)    return fail('配属する人の ID が未指定です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const vacantRow = ctx.allocationList.find(r => r.rowId === this.vacantRowId)!
    const personRow = ctx.allocationList.find(r => r.userId === this.personSfId && !r.concurrentType)
                   ?? ctx.allocationList.find(r => r.userId === this.personSfId)

    if (!personRow) {
      // Person not found: just set userId on the vacant row (fallback)
      return {
        updatedList: ctx.allocationList.map(r =>
          r.rowId === this.vacantRowId ? { ...r, userId: this.personSfId } : r
        ),
        label: `配属: ${this.personSfId}`,
      }
    }

    return assignPersonToVacant(personRow, vacantRow, ctx, {
      leaveSourceVacant: this.leaveSourceVacant,
      overrideBand:      this.overrideBand,
    })
  }
}
