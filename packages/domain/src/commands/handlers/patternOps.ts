// UI・サービス直呼び操作（OperationDef を持たない）
// ResignationOperation / VacantPositionMoveOperation / SecondmentReleaseOperation
// これらは HRApplicationService から直接呼ばれ、操作パネルのメニューには出ない。
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { AssignPersonToPositionOperation } from './positionOps'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── Resignation ───────────────────────────────────────────────────────────────

export class ResignationOperation implements EditCommand {
  readonly kind = 'Resignation'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
    private readonly memo?:          string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.transferReason)
      return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
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

export class VacantPositionMoveOperation implements EditCommand {
  readonly kind = 'VacantPositionMove'

  constructor(
    private readonly sourceRowId: number,
    private readonly targetRowId: number,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const source = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    const target = ctx.allocationList.find(r => r.rowId === this.targetRowId)
    if (!source)              return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!source.userId)       return fail('この行には人が配属されていません')
    if (!target)              return fail(`移動先行が見つかりません (rowId: ${this.targetRowId})`)
    if (target.userId)        return fail('移動先ポジションには既に人がいます')
    if (!target.positionCode) return fail('移動先にポジションコードがありません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const source = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const target = ctx.allocationList.find(r => r.rowId === this.targetRowId)!

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

export class SecondmentReleaseOperation implements EditCommand {
  readonly kind = 'SecondmentRelease'

  constructor(
    private readonly rowId:  number,
    private readonly fields: SecondmentReleaseFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    const prevEt = (row.prevEmploymentType as string | undefined) ?? ''
    if (!prevEt.includes('出向'))
      return fail('発令前の雇用タイプが出向ではないため出向解除できません')
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
      label: `出向解除: ${personName(row)}`,
    }
  }
}
