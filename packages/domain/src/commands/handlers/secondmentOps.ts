// 出向操作 — 本務出向・本務出向受入・兼務出向・兼務出向受入、およびそれぞれの解除
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── SecondmentOut（本務出向: 自社→他社） ────────────────────────────────────────

export interface SecondmentOutFields {
  secondmentToCompany: string
  departmentCode:      string
  employmentType?:     string
  transferReason?:     string
}

export class SecondmentOutOperation implements EditCommand {
  readonly kind = 'SecondmentOut'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentOutFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)                      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.userId)               return fail('人が配属されていない行に本務出向を設定できません')
    if (row.concurrentType === '兼務') return fail('兼務行には本務出向を設定できません')
    if (!this.fields.secondmentToCompany) return fail('出向先会社は必須です')
    if (!this.fields.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgSub = deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...this.fields, ...orgSub }
          : r
      ),
      label: `本務出向: ${personName(row)} → ${this.fields.secondmentToCompany}`,
    }
  }
}

// ── SecondmentIn（本務出向受入: 他社→自社） ──────────────────────────────────────

export interface SecondmentInFields {
  secondmentFromCompany?:        string
  secondmentFromEmployeeNumber?: string
  departmentCode?:               string
  employmentType?:               string
}

export class SecondmentInOperation implements EditCommand {
  readonly kind = 'SecondmentIn'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentInFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.fields.secondmentFromCompany) return fail('出向元会社は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgSub = this.fields.departmentCode
      ? deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
      : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...this.fields, ...orgSub }
          : r
      ),
      label: `本務出向受入: ${personName(row)} ← ${this.fields.secondmentFromCompany ?? ''}`,
    }
  }
}

// ── ConcurrentSecondmentOut（兼務出向: 自社→他社） ───────────────────────────────

export interface ConcurrentSecondmentOutFields {
  secondmentToCompany: string
  departmentCode:      string
  concurrentReason?:   string
}

export class ConcurrentSecondmentOutOperation implements EditCommand {
  readonly kind = 'ConcurrentSecondmentOut'

  constructor(
    private readonly sourceRowId: number,
    private readonly fields:      ConcurrentSecondmentOutFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!this.fields.secondmentToCompany) return fail('出向先会社は必須です')
    if (!this.fields.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const src = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                 newRowId,
      positionCode:          `_pos_${newRowId}`,
      departmentCode:        this.fields.departmentCode,
      concurrentType:        '兼務',
      concurrentReason:      this.fields.concurrentReason,
      secondmentToCompany:   this.fields.secondmentToCompany,
      prevDepartmentCode:    undefined,
      prevPositionCode:      undefined,
      prevConcurrentType:    undefined,
      prevSecondmentToCompany: undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向追加: ${personName(src)} → ${this.fields.secondmentToCompany}`,
    }
  }
}

// ── ConcurrentSecondmentIn（兼務出向受入: 他社→自社） ───────────────────────────

export interface ConcurrentSecondmentInFields {
  secondmentFromCompany:        string
  secondmentFromEmployeeNumber?: string
  departmentCode:               string
  concurrentReason?:            string
}

export class ConcurrentSecondmentInOperation implements EditCommand {
  readonly kind = 'ConcurrentSecondmentIn'

  constructor(
    private readonly sourceRowId: number,
    private readonly fields:      ConcurrentSecondmentInFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向受入を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向受入を追加できません')
    if (!this.fields.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!this.fields.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const src = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      departmentCode:                this.fields.departmentCode,
      concurrentType:                '兼務',
      concurrentReason:              this.fields.concurrentReason,
      secondmentFromCompany:         this.fields.secondmentFromCompany,
      secondmentFromEmployeeNumber:  this.fields.secondmentFromEmployeeNumber,
      prevDepartmentCode:            undefined,
      prevPositionCode:              undefined,
      prevConcurrentType:            undefined,
      prevSecondmentFromCompany:     undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入追加: ${personName(src)} ← ${this.fields.secondmentFromCompany}`,
    }
  }
}

// ── SecondmentOutRelease（本務出向解除: 自社発） ──────────────────────────────────

export interface SecondmentOutReleaseFields {
  employmentType?:  string
  departmentCode?:  string
  transferReason?:  string
}

export class SecondmentOutReleaseOperation implements EditCommand {
  readonly kind = 'SecondmentOutRelease'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentOutReleaseFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.prevSecondmentToCompany)
      return fail('出向先が設定されていないため出向解除できません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgSub = this.fields.departmentCode
      ? deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
      : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...this.fields, ...orgSub, secondmentToCompany: undefined }
          : r
      ),
      label: `本務出向解除: ${personName(row)}`,
    }
  }
}

// ── SecondmentInRelease（本務出向受入解除: 自社受入終了） ─────────────────────────

export interface SecondmentInReleaseFields {
  employmentType?: string
  transferReason?: string
}

export class SecondmentInReleaseOperation implements EditCommand {
  readonly kind = 'SecondmentInRelease'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentInReleaseFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? {
              ...r,
              ...this.fields,
              secondmentFromCompany:        undefined,
              secondmentFromEmployeeNumber: undefined,
            }
          : r
      ),
      label: `本務出向受入解除: ${personName(row)}`,
    }
  }
}

// ── ConcurrentSecondmentOutRelease（兼務出向解除） ────────────────────────────────

export class ConcurrentSecondmentOutReleaseOperation implements EditCommand {
  readonly kind = 'ConcurrentSecondmentOutRelease'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== this.rowId),
      label: `兼務出向解除: ${personName(row)}`,
    }
  }
}

// ── ConcurrentSecondmentInRelease（兼務出向受入解除） ─────────────────────────────

export class ConcurrentSecondmentInReleaseOperation implements EditCommand {
  readonly kind = 'ConcurrentSecondmentInRelease'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== this.rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  }
}
