import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding } from '../../allocationRow'
import type { EditOperation } from './types'

/**
 * 指定した行に対して「部下」（prevManagerPositionCode が一致する別行）の数を返す。
 * ドラッグ・通常 Edit いずれの文脈でも部下有無の判定に使う。
 */
export function countSubordinates(row: AllocationRow, allocationList: AllocationRow[]): number {
  const prevPosCode = row.prevPositionCode as string | undefined
  if (!prevPosCode) return 0
  return allocationList.filter(
    r => r.rowId !== row.rowId &&
      (r.prevManagerPositionCode as string | undefined) === prevPosCode
  ).length
}

/**
 * EditOperation をラップして「移動後に元ポジションを空席行として残す」挙動を追加する。
 *
 * 処理内容:
 *   1. ベース操作を実行（人が新組織へ移動）
 *   2. 移動した人に新規内部ポジションコード（_pos_XXXX）を付与
 *   3. 元ポジションの position/both フィールドを引き継いだ空席行を末尾に追加
 *
 * supportsLeaveVacant: true の def に対して UI 側から呼び出す。
 * ドラッグ（DragIntentPicker）と通常 Edit（OperationFormView）で共用する。
 */
export function withLeavePositionVacant(baseDef: EditOperation): EditOperation {
  return {
    ...baseDef,
    onSubmit(ctx, rowId, values) {
      const row        = ctx.allocationList.find(r => r.rowId === rowId)
      const oldPosCode = row?.positionCode as string | undefined

      if (!oldPosCode || !row) {
        return baseDef.onSubmit(ctx, rowId, values)
      }

      const baseResult = baseDef.onSubmit(ctx, rowId, values)

      // 新しい rowId / posCode を衝突なく採番
      const maxRowId     = Math.max(0, ...baseResult.updatedList.map(r => r.rowId))
      const vacantRowId  = maxRowId + 1
      const newPosCode   = `_pos_${maxRowId + 2}`

      // 移動した人に新ポジションコードを付与
      const updatedWithNewPos = baseResult.updatedList.map(r =>
        r.rowId === rowId ? { ...r, positionCode: newPosCode } : r
      )

      // 元ポジションの属性（position/both binding）を引き継いだ空席行を作成
      const positionFields = Object.fromEntries(
        afterKeysByBinding('position').map(k => [k, (row as Record<string, unknown>)[k as string]])
      )
      const bothFields = Object.fromEntries(
        afterKeysByBinding('both').map(k => [k, (row as Record<string, unknown>)[k as string]])
      )
      const vacantRow = {
        rowId: vacantRowId,
        ...bothFields,
        ...positionFields,
      } as AllocationRow

      return {
        updatedList: [...updatedWithNewPos, vacantRow],
        label: `${baseResult.label}（元ポジション空席）`,
      }
    },
  }
}
