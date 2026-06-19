/**
 * 操作定義レジストリ
 *
 * すべての EditOperation をここからエクスポートする。
 * UI・AI は ALL_EDIT_OPERATIONS を使って利用可能な操作を列挙し、
 * availableFor() でその行に適用できるかを判定する。
 *
 * bindOperation(op, rowId, values) で EditCommand（パラメータ束縛済み）に変換できる。
 *
 * 新しい操作を追加するときは:
 *   1. 対応するセクションの defs/*.ts ファイルに EditOperation と DEFS への追加
 *   2. ここの再エクスポートに追加
 */

export type { EditOperation, OperationDef, OperationGroup, OperationInput, SectionDivider } from './types'
export { isSectionDivider } from './types'
export { isRegularEmployee, isSecondmentAcceptance, isMainAssignment, wasSecondedOut, wasSecondedIn } from '../helpers'

// ── 昇降格・役職変更 ──────────────────────────────────────────────────────────
export { promotionDef, demotionDef, titleChangeDef } from './promotionDefs'

// ── 職務内容・雇用形態 ────────────────────────────────────────────────────────
export { jobTypeChangeDef, employmentExtensionDef } from './employmentTypeDefs'

// ── 組織への異動 ──────────────────────────────────────────────────────────────
export { orgTransferDef, orgRestructureDef, managerChangeDef } from './orgTransferDefs'

// ── 兼務 ─────────────────────────────────────────────────────────────────────
export { concurrentAddDef, concurrentAddNewDef, concurrentAddCancelDef, concurrentReleaseDef } from './concurrentDefs'

// ── 出向 ─────────────────────────────────────────────────────────────────────
export {
  secondmentOutSFDef, secondmentOutNonSFDef,
  secondmentInSFDef,  secondmentInNonSFDef,
  secondmentInNewSFDef, secondmentInNewNonSFDef,
  concurrentSecondmentOutSFDef,    concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,     concurrentSecondmentInNonSFDef,
  concurrentSecondmentInNewSFDef,  concurrentSecondmentInNewNonSFDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
} from './secondmentDefs'

// ── 在籍・退職 ────────────────────────────────────────────────────────────────
export { leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef, employmentTransferDef, noChangeDef } from './personDefs'

// ── ポジション追加 ────────────────────────────────────────────────────────────
export { addEmptyPositionDef } from './positionAddDef'

import type { EditOperation } from './types'
import type { EditCommand, DomainContext } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { DEFS as promotion }       from './promotionDefs'
import { DEFS as employmentType }  from './employmentTypeDefs'
import { DEFS as orgTransfer }     from './orgTransferDefs'
import { DEFS as concurrent }      from './concurrentDefs'
import { DEFS as secondment }      from './secondmentDefs'
import { DEFS as person }          from './personDefs'
import { DEFS as positionAdd }     from './positionAddDef'

export const ALL_EDIT_OPERATIONS: EditOperation[] = [
  ...promotion,
  ...employmentType,
  ...orgTransfer,
  ...concurrent,
  ...secondment,
  ...person,
  ...positionAdd,
]

/** 後方互換エイリアス */
export const ALL_OPERATION_DEFS = ALL_EDIT_OPERATIONS

/**
 * EditOperation にパラメータを束縛して EditCommand を生成する。
 * HRApplicationService.executeOperation() や EditScenario.commands に渡せる。
 */
export function bindOperation(
  op:     EditOperation,
  rowId:  number,
  values: Partial<AllocationRow>,
): EditCommand {
  return {
    kind:     op.id,
    validate: (ctx: DomainContext) => op.validate(ctx, rowId, values),
    apply:    (ctx: DomainContext) => op.apply(ctx, rowId, values),
  }
}
