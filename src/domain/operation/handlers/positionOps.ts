// Position operations — create, remove, assign, unassign.
// Each class implements IDomainOperation: validate() checks preconditions,
// apply() returns the new state as a pure transformation.

import type { IDomainOperation, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'

// ── CreateVacantPosition ─────────────────────────────────────────────────────

export class CreateVacantPositionOperation implements IDomainOperation {
  readonly kind = 'CreateVacantPosition'

  constructor(
    private readonly departmentCode: string,
    private readonly localJobTitle:  string,
    private readonly extraFields?:   Partial<AllocationRow>,
  ) {}

  validate(_ctx: OperationContext): ValidationResult {
    if (!this.departmentCode) return fail('部門コードは必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const rowId = nextRowId(ctx.allocationList)
    const newRow: AllocationRow = {
      rowId,
      departmentCode: this.departmentCode,
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

export class RemovePositionOperation implements IDomainOperation {
  readonly kind = 'RemovePosition'

  constructor(private readonly rowId: number) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)            return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.positionCode) return fail('ポジションコードがありません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const label = `ポジション削除: ${row.localJobTitle ?? row.positionCode}`

    if (row.userId) {
      // 在席中: ポジション行を削除し、人を未アサイン行に残す
      const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
      const allocClears    = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
      const unassignedRow: AllocationRow = {
        ...row,
        rowId: nextRowId(ctx.allocationList),
        ...positionClears,
        ...allocClears,
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

export class UnassignPersonFromPositionOperation implements IDomainOperation {
  readonly kind = 'UnassignPersonFromPosition'

  constructor(private readonly occupiedRowId: number) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.occupiedRowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.occupiedRowId})`)
    if (!row.userId)   return fail('この行には人が配属されていません')
    if (!row.positionCode) return fail('ポジションコードがありません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.occupiedRowId)!

    const personClears   = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
    const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears    = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))

    const vacantRow: AllocationRow = { ...row, userId: undefined, ...personClears, ...allocClears }
    const unassignedRow: AllocationRow = {
      ...row,
      rowId: nextRowId([...ctx.allocationList, vacantRow]),
      ...positionClears,
      ...allocClears,
    }

    const hasOtherRowInOrg = ctx.allocationList.some(
      r => r.rowId !== this.occupiedRowId && r.userId === row.userId && r.departmentCode === row.departmentCode
    )

    const updated = ctx.allocationList.map(r => r.rowId === this.occupiedRowId ? vacantRow : r)
    return {
      updatedList: hasOtherRowInOrg ? updated : [...updated, unassignedRow],
      label: `アサイン解除: ${row.lastName ?? ''}${row.firstName ?? ''}`,
    }
  }
}

// ── SetPositionManager ───────────────────────────────────────────────────────

export class SetPositionManagerOperation implements IDomainOperation {
  readonly kind = 'SetPositionManager'

  constructor(
    private readonly rowId:               number,
    private readonly managerPositionCode: string | undefined,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row   = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const label = this.managerPositionCode
      ? `上司設定: ${row.localJobTitle ?? row.positionCode ?? ''}`
      : `上司解除: ${row.localJobTitle ?? row.positionCode ?? ''}`
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, managerPositionCode: this.managerPositionCode } : r
      ),
      label,
    }
  }
}

// ── AssignPersonToPosition ───────────────────────────────────────────────────

export class AssignPersonToPositionOperation implements IDomainOperation {
  readonly kind = 'AssignPersonToPosition'

  constructor(
    private readonly vacantRowId: number,
    private readonly personSfId:  string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const vacantRow = ctx.allocationList.find(r => r.rowId === this.vacantRowId)
    if (!vacantRow)         return fail(`行が見つかりません (rowId: ${this.vacantRowId})`)
    if (vacantRow.userId)   return fail('このポジションは既に在席中です')
    if (!vacantRow.positionCode) return fail('ポジションコードがありません')
    if (!this.personSfId)   return fail('配属する人の ID が未指定です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const vacantRow = ctx.allocationList.find(r => r.rowId === this.vacantRowId)!
    const personRow = ctx.allocationList.find(r => r.userId === this.personSfId && !r.concurrentType)
                   ?? ctx.allocationList.find(r => r.userId === this.personSfId)

    const allocClears  = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const personClears = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
    const label = `配属: ${personRow ? (personRow.lastName ?? '') + (personRow.firstName ?? '') : this.personSfId}`

    if (!personRow) {
      return {
        updatedList: ctx.allocationList.map(r =>
          r.rowId === this.vacantRowId ? { ...r, userId: this.personSfId } : r
        ),
        label,
      }
    }

    // personRow を起点にして position/both フィールドを vacantRow で上書き
    // → 名前・band 等の人情報を保持しつつポジション情報を引き継ぐ
    const positionAndBothFields = Object.fromEntries(
      [...afterKeysByBinding('position'), ...afterKeysByBinding('both')]
        .map(k => [k, vacantRow[k as keyof AllocationRow]])
    )
    const filledRow: AllocationRow = {
      ...personRow,
      rowId:  vacantRow.rowId,
      userId: this.personSfId,
      ...positionAndBothFields,
      ...allocClears,
    }

    const isUnassigned = !personRow.positionCode

    if (isUnassigned) {
      // Case A: 未アサイン行を削除し、空席行を配属行に置き換え
      return {
        updatedList: [
          ...ctx.allocationList.filter(r => r.rowId !== this.vacantRowId && r.rowId !== personRow.rowId),
          filledRow,
        ],
        label,
      }
    }

    // Case B: 元の在席行を空席化し、空席行を配属行に置き換え
    const vacatedPersonRow: AllocationRow = {
      ...personRow,
      userId: undefined,
      ...personClears,
      ...allocClears,
    }
    return {
      updatedList: ctx.allocationList.map(r => {
        if (r.rowId === this.vacantRowId)  return filledRow
        if (r.rowId === personRow.rowId)   return vacatedPersonRow
        return r
      }),
      label,
    }
  }
}
