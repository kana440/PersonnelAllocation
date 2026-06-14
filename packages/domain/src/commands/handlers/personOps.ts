// 在籍・退職 — LeaveOfAbsence / ReturnFromLeave / NoChange / EmploymentTransferOut / EmploymentTransferIn
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── LeaveOfAbsence ────────────────────────────────────────────────────────────

export class LeaveOfAbsenceOperation implements EditCommand {
  readonly kind = 'LeaveOfAbsence'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
    private readonly memo?:          string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.userId) return fail('人が配属されていない行に休職を設定できません')
    if (row.leaveOfAbsenceSign) return fail('すでに休職中です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? {
              ...r,
              leaveOfAbsenceSign: '1',
              transferReason:     this.transferReason,
              ...(this.memo !== undefined ? { memo: this.memo } : {}),
            }
          : r
      ),
      label: `休職: ${personName(row)}`,
    }
  }
}

// ── ReturnFromLeave ───────────────────────────────────────────────────────────

export class ReturnFromLeaveOperation implements EditCommand {
  readonly kind = 'ReturnFromLeave'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string | undefined,
    private readonly memo?:          string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)                    return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.leaveOfAbsenceSign) return fail('休職中ではないため復職できません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? {
              ...r,
              leaveOfAbsenceSign: undefined,
              transferReason:     this.transferReason,
              ...(this.memo !== undefined ? { memo: this.memo } : {}),
            }
          : r
      ),
      label: `復職: ${personName(row)}`,
    }
  }
}

// ── NoChange ──────────────────────────────────────────────────────────────────

export class NoChangeOperation implements EditCommand {
  readonly kind = 'NoChange'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.transferReason) return fail('変更なし事由は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!

    // after フィールドを全て before 値にリセットしてから transferReason をセット
    const reset: Partial<AllocationRow> = {}
    for (const { after, before } of FIELD_METADATA) {
      ;(reset as Record<string, unknown>)[after] = row[before]
    }

    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...reset, transferReason: this.transferReason, memo: undefined, promotionSign: undefined, demotionReason: undefined, payGradeChangeSign: undefined }
          : r
      ),
      label: `変更なし: ${personName(row)}`,
    }
  }
}

// ── EmploymentTransferOut ─────────────────────────────────────────────────────
// グループ会社間転籍で自社を離れるケース。After state を全てブランクにする。

export class EmploymentTransferOutOperation implements EditCommand {
  readonly kind = 'EmploymentTransferOut'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.userId)   return fail('人が配属されていない行に移籍（出る）を設定できません')
    if (!this.transferReason) return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!

    // After state を全てブランクにして transferReason のみセット
    const reset: Partial<AllocationRow> = {}
    for (const { after } of FIELD_METADATA) {
      ;(reset as Record<string, unknown>)[after] = undefined
    }

    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...reset, transferReason: this.transferReason }
          : r
      ),
      label: `移籍（出る）: ${personName(row)}`,
    }
  }
}

// ── EmploymentTransferIn ──────────────────────────────────────────────────────
// グループ会社間転籍で自社に入社するケース。新規行として追加する。
// prevXxx フィールドは空（新規行のため before 状態なし）。

export interface EmploymentTransferInFields {
  userId?:          string
  employeeNumber?:  string
  lastName?:        string
  firstName?:       string
  departmentCode?:  string
  employmentType?:  string
  band?:            string
  payGrade?:        string
  officialPositionCode?: string
  localJobTitle?:   string
  transferReason?:  string
  [key: string]:    string | undefined
}

export class EmploymentTransferInOperation implements EditCommand {
  readonly kind = 'EmploymentTransferIn'

  constructor(
    private readonly fields: EmploymentTransferInFields,
  ) {}

  validate(_ctx: DomainContext): ValidationResult {
    if (!this.fields.departmentCode) return fail('組織コードは必須です')
    if (!this.fields.transferReason) return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const newRowId = nextRowId(ctx.allocationList)
    const orgSub = this.fields.departmentCode
      ? deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
      : {}

    const newRow: AllocationRow = {
      rowId: newRowId,
      ...this.fields,
      ...orgSub,
      positionCode: `_pos_${newRowId}`,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `移籍（入る）: ${[this.fields.lastName, this.fields.firstName].filter(Boolean).join(' ') || '新規'}`,
    }
  }
}
