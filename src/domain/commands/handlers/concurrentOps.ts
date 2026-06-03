// 兼務操作 — 社内兼務追加・解除
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── ConcurrentAdd ─────────────────────────────────────────────────────────────

export class ConcurrentAddOperation implements EditCommand {
  readonly kind = 'ConcurrentAdd'

  constructor(
    private readonly sourceRowId:     number,
    private readonly departmentCode:  string,
    private readonly concurrentReason?: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!row.userId)   return fail('人が配属されていない行には兼務を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務を追加できません（本務行を指定してください）')
    if (!this.departmentCode) return fail('兼務先組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const src = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const newRowId = nextRowId(ctx.allocationList)

    // 人情報を本務行からコピーし、ポジション・配属フィールドはリセット
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSubFields = deriveOrgSubFields(this.departmentCode, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSubFields,
      rowId:          newRowId,
      departmentCode: this.departmentCode,
      positionCode:   `_pos_${newRowId}`,
      concurrentType: '兼務',
      concurrentReason: this.concurrentReason,
      // prev* はコピーしない（新規行なので before 状態なし）
      prevDepartmentCode: undefined,
      prevPositionCode:   undefined,
      prevConcurrentType: undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `社内兼務追加: ${personName(src)}`,
    }
  }
}

// ── ConcurrentRelease ─────────────────────────────────────────────────────────

export class ConcurrentReleaseOperation implements EditCommand {
  readonly kind = 'ConcurrentRelease'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (row.concurrentType !== '兼務')
      return fail('この行は兼務行ではありません')
    if (row.secondmentToCompany || row.secondmentFromCompany)
      return fail('出向兼務行は社内兼務解除ではなく出向解除操作を使用してください')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== this.rowId),
      label: `社内兼務解除: ${personName(row)}`,
    }
  }
}
