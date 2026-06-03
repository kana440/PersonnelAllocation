// 在籍状況操作 — 休職・復職・雇用延長・変更なし
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA } from '../../allocationRow'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── LeaveOfAbsence（休職） ───────────────────────────────────────────────────

export class LeaveOfAbsenceOperation implements EditCommand {
  readonly kind = 'LeaveOfAbsence'

  constructor(
    private readonly rowId:     number,
    private readonly leaveFlag: string,
    private readonly memo?:     string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.userId) return fail('人が配属されていない行に休職を設定できません')
    if (row.leaveFlag) return fail('すでに休職中です')
    if (!this.leaveFlag) return fail('休職フラグは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, leaveFlag: this.leaveFlag, ...(this.memo !== undefined ? { memo: this.memo } : {}) }
          : r
      ),
      label: `休職: ${personName(row)}`,
    }
  }
}

// ── ReturnFromLeave（復職） ──────────────────────────────────────────────────

export class ReturnFromLeaveOperation implements EditCommand {
  readonly kind = 'ReturnFromLeave'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.leaveFlag) return fail('休職中ではないため復職できません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, leaveFlag: undefined } : r
      ),
      label: `復職: ${personName(row)}`,
    }
  }
}

// ── EmploymentExtension（雇用延長） ──────────────────────────────────────────

export interface EmploymentExtensionFields {
  employmentType: string
  band?:          string
  payGrade?:      string
}

export class EmploymentExtensionOperation implements EditCommand {
  readonly kind = 'EmploymentExtension'

  constructor(
    private readonly rowId:  number,
    private readonly fields: EmploymentExtensionFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.fields.employmentType) return fail('雇用タイプは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const changes = Object.fromEntries(
      Object.entries(this.fields).filter(([, v]) => v !== undefined)
    )
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, ...changes } : r
      ),
      label: `雇用延長: ${personName(row)}`,
    }
  }
}

// ── NoChange（変更なし） ─────────────────────────────────────────────────────

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
