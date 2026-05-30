// Pattern-level domain operations.
// Each represents one semantic business intent (org transfer, promotion, etc.).
// These are coarser-grained than DirectEditOperation and carry meaningful undo labels.
// Both Web pattern dialogs and AI tools converge here via HRApplicationService methods.

import type { IDomainOperation, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { AssignPersonToPositionOperation } from './positionOps'

// ── Helpers ───────────────────────────────────────────────────────────────────

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── OrgTransfer ───────────────────────────────────────────────────────────────

export class OrgTransferOperation implements IDomainOperation {
  readonly kind = 'OrgTransfer'

  constructor(
    private readonly rowId:          number,
    private readonly departmentCode: string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.departmentCode)
      return fail('組織コードは必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row     = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgName = ctx.afterOrganizations.find(o => o.externalCode === this.departmentCode)?.name
                 ?? this.departmentCode
    const subFields = deriveOrgSubFields(this.departmentCode, ctx.codeLists)
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, departmentCode: this.departmentCode, ...subFields }
          : r
      ),
      label: `組織異動: ${personName(row)} → ${orgName}`,
    }
  }
}

// ── Promotion / Demotion ─────────────────────────────────────────────────────

export interface PromotionFields {
  officialPositionCode?: string
  localJobTitle?:        string
  positionBand?:         string
  band?:                 string
  payGrade?:             string
}

export class PromotionOperation implements IDomainOperation {
  readonly kind = 'Promotion'

  constructor(
    private readonly rowId:  number,
    private readonly fields: PromotionFields,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const changes = Object.fromEntries(
      Object.entries(this.fields).filter(([, v]) => v !== undefined)
    )
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, ...changes } : r
      ),
      label: `昇降格: ${personName(row)}`,
    }
  }
}

// ── JobTypeChange ─────────────────────────────────────────────────────────────

export interface JobTypeFields {
  jobFamily?: string
  jobType?:   string
}

export class JobTypeChangeOperation implements IDomainOperation {
  readonly kind = 'JobTypeChange'

  constructor(
    private readonly rowId:  number,
    private readonly fields: JobTypeFields,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const changes = Object.fromEntries(
      Object.entries(this.fields).filter(([, v]) => v !== undefined)
    )
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, ...changes } : r
      ),
      label: `ジョブタイプ変更: ${personName(row)}`,
    }
  }
}

// ── Resignation ───────────────────────────────────────────────────────────────

export class ResignationOperation implements IDomainOperation {
  readonly kind = 'Resignation'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
    private readonly memo?:          string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.transferReason)
      return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, transferReason: this.transferReason, ...(this.memo !== undefined ? { memo: this.memo } : {}) }
          : r
      ),
      label: `退職設定: ${personName(row)}`,
    }
  }
}

// ── VacantPositionMove ────────────────────────────────────────────────────────

export class VacantPositionMoveOperation implements IDomainOperation {
  readonly kind = 'VacantPositionMove'

  constructor(
    private readonly sourceRowId: number,
    private readonly targetRowId: number,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const source = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    const target = ctx.allocationList.find(r => r.rowId === this.targetRowId)
    if (!source)              return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!source.userId)       return fail('この行には人が配属されていません')
    if (!target)              return fail(`移動先行が見つかりません (rowId: ${this.targetRowId})`)
    if (target.userId)        return fail('移動先ポジションには既に人がいます')
    if (!target.positionCode) return fail('移動先にポジションコードがありません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const source = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const target = ctx.allocationList.find(r => r.rowId === this.targetRowId)!

    // AssignPersonToPositionOperation の Case B ロジックを再利用
    const innerResult = new AssignPersonToPositionOperation(
      this.targetRowId,
      source.userId!,
    ).apply(ctx)

    const posTitle = target.localJobTitle || target.officialPositionCode || target.positionCode
    return {
      ...innerResult,
      label: `ポジション異動: ${personName(source)} → ${posTitle}`,
    }
  }
}

// ── SecondmentRelease ─────────────────────────────────────────────────────────

export interface SecondmentReleaseFields {
  employmentType?:         string
  secondmentToCompany?:    string
  secondmentFromCompany?:  string
  transferReason?:         string
  memo?:                   string
}

export class SecondmentReleaseOperation implements IDomainOperation {
  readonly kind = 'SecondmentRelease'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentReleaseFields,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    const prevEt = (row.prevEmploymentType as string | undefined) ?? ''
    if (!prevEt.includes('出向'))
      return fail('発令前の雇用タイプが出向ではないため出向解除できません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const changes = Object.fromEntries(
      Object.entries(this.fields).filter(([, v]) => v !== undefined)
    )
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId ? { ...r, ...changes } : r
      ),
      label: `出向解除: ${personName(row)}`,
    }
  }
}
