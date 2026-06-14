// 職務内容・雇用形態 — JobTypeChange / EmploymentExtension
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── JobTypeChange ─────────────────────────────────────────────────────────────

export interface JobTypeFields {
  jobFamily?: string
  jobType?:   string
}

export class JobTypeChangeOperation implements EditCommand {
  readonly kind = 'JobTypeChange'

  constructor(
    private readonly rowId:  number,
    private readonly fields: JobTypeFields,
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
      label: `ジョブタイプ変更: ${personName(row)}`,
    }
  }
}

// ── EmploymentExtension ───────────────────────────────────────────────────────

export interface EmploymentExtensionFields {
  transferReason: string
  memo?:          string
  /** computeAfterFields の結果。undefined 値 = 空欄化、非 undefined 値 = 自動導出上書き */
  computedFields?: Partial<AllocationRow>
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
    if (!this.fields.transferReason) return fail('変更事由は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const newRow = { ...row }
    // computedFields のエントリを順に適用（undefined = 空欄化、値あり = 自動導出上書き）
    for (const [key, value] of Object.entries(this.fields.computedFields ?? {})) {
      ;(newRow as Record<string, unknown>)[key] = value
    }
    newRow.transferReason = this.fields.transferReason as AllocationRow['transferReason']
    if (this.fields.memo !== undefined) {
      newRow.memo = this.fields.memo as AllocationRow['memo']
    }
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === this.rowId ? newRow : r),
      label: `雇用延長: ${personName(row)}`,
    }
  }
}
