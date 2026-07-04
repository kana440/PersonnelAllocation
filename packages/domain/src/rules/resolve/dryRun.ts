import type { AllocationRow } from '../../allocationRow'
import type { DomainContext, OperationError } from '../../commands/types'
import type { ValidationResolutionDef } from './types'

export interface DryRunResult {
  rowId:   number
  valid:   boolean
  errors?: OperationError[]
}

/**
 * 一括修正のプレビュー（DryRun）。
 * 各 rowId に対して createCommand→validate を実行し、成否を返す。
 * apply は呼ばない（副作用なし）。
 *
 * 各行は同じ ctx で独立して検証する（直列適用ではない）。
 * 依存関係が強いケースでは呼び出し側で ctx を更新しながら逐次呼ぶこと。
 */
export function dryRunResolution(
  def:    ValidationResolutionDef,
  rowIds: number[],
  values: Partial<AllocationRow>,
  ctx:    DomainContext,
): DryRunResult[] {
  return rowIds.map(rowId => {
    const cmd    = def.createCommand(rowId, values)
    const result = cmd.validate(ctx)
    if (result.ok) {
      return { rowId, valid: true }
    }
    return { rowId, valid: false, errors: result.errors }
  })
}
