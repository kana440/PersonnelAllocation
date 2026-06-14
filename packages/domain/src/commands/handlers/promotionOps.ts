// 昇降格・役職変更 — Promotion / Demotion / TitleChange
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── Promotion ─────────────────────────────────────────────────────────────────

export interface PromotionFields {
  officialPositionCode?: string
  localJobTitle?:        string
  positionCode?:         string
  positionBand?:         string
  band?:                 string
  payGrade?:             string
  promotionSign?:        string
  payGradeChangeSign?:   string
}

export class PromotionOperation implements EditCommand {
  readonly kind = 'Promotion'

  constructor(
    private readonly rowId:  number,
    private readonly fields: PromotionFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
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
      label: `昇降格: ${personName(row)}`,
    }
  }
}

// ── Demotion ──────────────────────────────────────────────────────────────────

export interface DemotionFields {
  officialPositionCode?: string
  localJobTitle?:        string
  positionCode?:         string
  positionBand?:         string
  band?:                 string
  payGrade?:             string
  demotionReason?:       string
  payGradeChangeSign?:   string
}

export class DemotionOperation implements EditCommand {
  readonly kind = 'Demotion'

  constructor(
    private readonly rowId:  number,
    private readonly fields: DemotionFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
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
      label: `降格: ${personName(row)}`,
    }
  }
}

// ── TitleChange ───────────────────────────────────────────────────────────────

export interface TitleChangeFields {
  officialPositionCode?: string
  localJobTitle?:        string
}

export class TitleChangeOperation implements EditCommand {
  readonly kind = 'TitleChange'

  constructor(
    private readonly rowId:  number,
    private readonly fields: TitleChangeFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
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
      label: `役職変更: ${personName(row)}`,
    }
  }
}
