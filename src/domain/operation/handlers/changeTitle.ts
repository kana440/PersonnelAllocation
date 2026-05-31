import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveManagerName } from '../orgHelpers'

/**
 * officialPositionCode に対応する推奨バンド・給与等級を返す。
 * コードリストに役職→バンド変換が追加されたらここで引く。
 */
export function derivePersonGradeFields(
  _officialPositionCode: string,
  _ctx: OperationContext,
): { positionBand?: string; band?: string; payGrade?: string } {
  return {}
}

/**
 * 役職変更操作。
 *
 * - 対象行に新しい内部 positionCode を採番し、役職・バンド・給与等級を更新する
 * - 旧ポジションを空席行として残す（prevXxx は不変）
 * - 部下（managerPositionCode が旧 positionCode と一致する行）を新 positionCode に追従させる
 */
export class ChangeTitleOperation implements EditCommand {
  readonly kind = 'ChangeTitle'

  constructor(
    private readonly rowId:                number,
    private readonly officialPositionCode: string,
    private readonly localJobTitle:        string,
    private readonly positionBand:         string,
    private readonly band:                 string,
    private readonly payGrade:             string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)              return fail('対象行が見つかりません')
    if (!row.userId)       return fail('人が配属されていません')
    if (!row.positionCode) return fail('ポジションコードがありません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row            = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const oldPositionCode = row.positionCode!
    const newPosCode      = `_pos_${nextRowId(ctx.allocationList)}`

    // 給与等級が変わる場合は変更サインを自動付与
    const payGradeChangeSign =
      this.payGrade !== row.payGrade ? '1' : row.payGradeChangeSign

    // 1. 対象行を更新（prevXxx はスプレッドで保持）
    const updatedRow: AllocationRow = {
      ...row,
      positionCode:         newPosCode,
      officialPositionCode: this.officialPositionCode || undefined,
      localJobTitle:        this.localJobTitle        || undefined,
      positionBand:         this.positionBand         || undefined,
      band:                 this.band                 || undefined,
      payGrade:             this.payGrade             || undefined,
      payGradeChangeSign,
    }

    // 2. 旧ポジションの空席行を生成（position フィールドを引き継ぎ、person・allocation はクリア）
    const vacantId     = nextRowId([...ctx.allocationList, updatedRow])
    const personClears = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
    const allocClears  = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const positionFields = Object.fromEntries(
      afterKeysByBinding('position').map(k => [k, row[k as keyof AllocationRow]])
    )
    const vacantRow: AllocationRow = {
      rowId:    vacantId,
      assignee: row.assignee,
      ...positionFields,
      ...personClears,
      ...allocClears,
    } as AllocationRow

    // 3. 部下の managerPositionCode を新 positionCode に追従させる
    const withVacant = [
      ...ctx.allocationList.map(r => r.rowId === this.rowId ? updatedRow : r),
      vacantRow,
    ]
    const finalList = withVacant.map(r => {
      if (r.rowId === updatedRow.rowId)      return r
      if (r.managerPositionCode !== oldPositionCode) return r
      return {
        ...r,
        managerPositionCode: newPosCode,
        managerName: deriveManagerName(newPosCode, withVacant),
      }
    })

    const name  = [row.lastName, row.firstName].filter(Boolean).join('')
    const label = `役職変更: ${name} → ${this.localJobTitle || this.officialPositionCode || newPosCode}`
    return { updatedList: finalList, label }
  }
}
