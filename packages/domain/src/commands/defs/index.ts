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

export type { EditOperation, OperationDef, OperationGroup, OperationRole, OperationInput, InputRow, SectionDivider, FieldChangeEffect, AvailabilityResult } from './types'
export { isSectionDivider, isInputRow, AVAILABLE, unavailable } from './types'
export type { OperationBadge } from './badge'
export { isRegularEmployee, isSecondmentAcceptance, isMainAssignment, wasSecondedOut, wasSecondedIn } from '../helpers'
export { preserve } from './afterConstraintHelpers'

// ── 昇降格・役職変更 ──────────────────────────────────────────────────────────
export { promotionDef, demotionDef, titleChangeDef } from './promotionDefs'

// ── 職務内容・雇用形態 ────────────────────────────────────────────────────────
export { jobTypeChangeDef, employmentExtensionDef } from './employmentTypeDefs'

// ── 組織への異動 ──────────────────────────────────────────────────────────────
export { orgTransferDef, orgRestructureDef } from './orgTransferDefs'

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
export { leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef, employmentTransferDef, noChangeDef, noChangeCancelDef } from './personDefs'

// ── 上司変更・ポジション追加 ─────────────────────────────────────────────────
export { managerChangeDef, addEmptyPositionDef } from './positionAddDef'

import type { EditOperation, AvailabilityResult } from './types'
import { AVAILABLE } from './types'
import type { EditCommand, DomainContext } from '../types'
import type { AllocationRow } from '../../allocationRow'
import type { AllMasters } from '../../masters/aggregate'
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

// ── 複数行操作 ────────────────────────────────────────────────────────────────
export type { MultiRowOperationDef, MultiRowFormSection } from './multiRowTypes'
export { ALL_MULTI_ROW_OPERATION_DEFS, nonSFSecondmentOutDef } from './multiRowDefs'

/**
 * `operationRole` を考慮した availableFor 判定。
 * 不可の場合は reason で理由を返す（UI tooltip・AI デバッグ用）。
 *
 * lockCancel: 対応する lock の isActiveThisSession が true のときだけ表示。
 * lock 含む通常操作: いずれかの lock が active なら全てブロック。
 */
export function resolveAvailability(
  def:     EditOperation,
  row:     AllocationRow,
  masters: AllMasters,
): AvailabilityResult {
  const forResult = def.availableFor(row, masters)
  if (!forResult.available) return forResult

  const activeLock = ALL_EDIT_OPERATIONS.find(
    d => d.operationRole?.kind === 'lock' && d.operationRole.isActiveThisSession(row),
  )

  if (def.operationRole?.kind === 'lockCancel') {
    if (activeLock?.id === def.operationRole.of) return AVAILABLE
    return { available: false, reason: `${def.operationRole.of} がセッション内で有効でないため取消できません` }
  }

  if (activeLock) {
    return { available: false, reason: `「${activeLock.label}」が設定中のため他の操作はできません` }
  }

  return AVAILABLE
}


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
    validate: (ctx: DomainContext) => op.onValidate(ctx, rowId, values),
    apply:    (ctx: DomainContext) => op.onSubmit(ctx, rowId, values),
  }
}
