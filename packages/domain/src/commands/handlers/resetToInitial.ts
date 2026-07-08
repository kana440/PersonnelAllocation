// ResetToInitial — rewrites a single row's after-fields back to its before (Prev) values
// and clears session-only meta fields (transferReason / memo / promotionSign / demotionReason /
// payGradeChangeSign). Used by the canvas and table multi-select bars' "初期に戻す" bulk action.

import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA, copyBeforeToAfter } from '../../allocationRow'
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, failField } from '../types'

/**
 * prevXxx が全フィールドで空 = インポート由来の初期状態を持たない新規追加行。
 * UI 側（キャンバス/表形式の一括操作バー）が実行前に対象を絞り込むのに使う
 * （executeBatch は all-or-nothing なので、1件でも対象外の行が混ざると全体が失敗する）。
 */
export function hasResetBaseline(row: AllocationRow): boolean {
  return FIELD_METADATA.some(({ before }) => !!row[before])
}

export class ResetToInitialOperation implements EditCommand {
  readonly kind = 'ResetToInitial'

  constructor(private readonly rowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return failField('rowId', `Row ${this.rowId} not found`)
    if (!hasResetBaseline(row)) return failField('rowId', 'この行は新規追加行のため初期状態がありません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const updatedList = ctx.allocationList.map(r =>
      r.rowId === this.rowId ? copyBeforeToAfter(r) : r
    )
    return { updatedList, label: '初期状態に戻す' }
  }
}
