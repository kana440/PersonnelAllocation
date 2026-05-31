import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'

/**
 * allocationList 内の行を別の位置へ移動する。
 * beforeRowId が null の場合はリスト末尾に追加。
 * 並べ替えのみ行い、positionCode や managerPositionCode は変更しない。
 * positionTreeByOrgId は managerPositionCode で再構築されるため、
 * ツリー階層を保ったまま兄弟の表示順だけが変わる。
 */
export class ReorderRowOperation implements EditCommand {
  readonly kind = 'ReorderRow'

  constructor(
    private readonly rowId:       number,
    private readonly beforeRowId: number | null,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail('対象行が見つかりません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row) return { updatedList: ctx.allocationList, label: '並べ替え' }

    const without  = ctx.allocationList.filter(r => r.rowId !== this.rowId)
    if (this.beforeRowId === null) {
      return { updatedList: [...without, row], label: '並べ替え' }
    }
    const insertAt = without.findIndex(r => r.rowId === this.beforeRowId)
    if (insertAt === -1) {
      return { updatedList: [...without, row], label: '並べ替え' }
    }
    return {
      updatedList: [...without.slice(0, insertAt), row, ...without.slice(insertAt)],
      label: '並べ替え',
    }
  }
}
