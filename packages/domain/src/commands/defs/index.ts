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

export type { EditOperation, OperationDef, OperationGroup, OperationRole, OperationInput, InputRow, SectionDivider, FieldChangeEffect, AvailabilityResult, OperationEntryPoint } from './types'
export { isSectionDivider, isInputRow, AVAILABLE, unavailable } from './types'
export type { OperationBadge } from './badge'
export { isRegularEmployee, isSecondmentAcceptance, isMainAssignment, wasSecondedOut, wasSecondedIn } from '../helpers'
export { preserve } from './afterConstraintHelpers'
export {
  withLeavePositionVacant,
  countSubordinates,
  getDirectSubordinates,
  getSameOrgSubordinates,
  getOtherOrgSubordinates,
  isVacantPosition,
  isOccupiedPosition,
  isUnassignedPerson,
  makeVacantRowFrom,
  vacatePosition,
  extractPositionFieldsFrom,
  wouldBandChange,
  assignPersonToVacant,
  type AssignToVacantOptions,
} from './positionVacant'

// ── 昇降格・役職変更 ──────────────────────────────────────────────────────────
export { promotionDef, demotionDef, titleChangeDef } from './promotionDefs'

// ── 職務内容・雇用形態 ────────────────────────────────────────────────────────
export { jobTypeChangeDef, employmentExtensionDef, employmentExtensionCancelDef } from './employmentTypeDefs'

// ── 組織への異動 ──────────────────────────────────────────────────────────────
export { orgTransferDef, orgRestructureDef } from './orgTransferDefs'

// ── 兼務 ─────────────────────────────────────────────────────────────────────
export { concurrentAddDef, concurrentAddNewDef, concurrentAddCancelDef, concurrentReleaseDef } from './concurrentDefs'

// ── 本務出向 ──────────────────────────────────────────────────────────────────
export {
  secondmentOutSFDef, secondmentOutNonSFDef,
  secondmentInNewDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  secondmentInCancelDef,
} from './secondmentMainDefs'

// ── 兼務出向 ──────────────────────────────────────────────────────────────────
export {
  concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInNewDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
  concurrentSecondmentInCancelDef,
} from './secondmentConcurrentDefs'

// ── 在籍・退職 ────────────────────────────────────────────────────────────────
export { leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef, returnFromLeaveCancelDef, resignationDef, resignationCancelDef, employmentTransferDef, employmentTransferCancelDef, noChangeDef, noChangeCancelDef, resetToBeforeDef } from './personDefs'

// ── 上司変更・ポジション追加 ─────────────────────────────────────────────────
export { managerChangeDef, addEmptyPositionDef, addEmptyPositionCancelDef } from './positionAddDef'

// ── 部下引継・空Pos移動 ───────────────────────────────────────────────────────
export { subordinateHandoffDef, moveToVacantPositionDef } from './positionMoveDefs'

import type { EditOperation, AvailabilityResult } from './types'
import { AVAILABLE } from './types'
import type { EditCommand } from '../types'
import type { AllocationRow } from '../../allocationRow'
import type { AllMasters } from '../../masters/aggregate'
import { DEFS as promotion }       from './promotionDefs'
import { DEFS as employmentType }  from './employmentTypeDefs'
import { DEFS as orgTransfer }     from './orgTransferDefs'
import { DEFS as concurrent }      from './concurrentDefs'
import { DEFS as secondmentMain }       from './secondmentMainDefs'
import { DEFS as secondmentConcurrent } from './secondmentConcurrentDefs'
import { DEFS as person }          from './personDefs'
import { DEFS as positionAdd }     from './positionAddDef'
import { DEFS as positionMove }    from './positionMoveDefs'

export const ALL_EDIT_OPERATIONS: EditOperation[] = [
  ...promotion,
  ...employmentType,
  ...orgTransfer,
  ...concurrent,
  ...secondmentMain,
  ...secondmentConcurrent,
  ...person,
  ...positionAdd,
  ...positionMove,
]

/** 後方互換エイリアス */
export const ALL_OPERATION_DEFS = ALL_EDIT_OPERATIONS

// ── 複数行操作 ────────────────────────────────────────────────────────────────
export type { MultiRowOperationDef, MultiRowFormSection } from './multiRowTypes'
export { ALL_MULTI_ROW_OPERATION_DEFS, nonSFSecondmentOutDef } from './multiRowDefs'

/**
 * softLock がアクティブな行の「所有フィールド」情報を返す。
 *
 * OperationFormView はこの戻り値を使って:
 *   Layer 2: ownedFields を readOnly 表示する
 *   Layer 1: submit 直前に values へ現在値を注入する（onSubmit が書き換えても防ぐ）
 */
export type ActiveSoftLock = EditOperation & {
  operationRole: {
    kind:        'softLock'
    ownedFields: readonly (keyof AllocationRow)[]
    isActive(row: AllocationRow): boolean
    isActiveThisSession(row: AllocationRow): boolean
  }
}

export function getActiveSoftLock(row: AllocationRow): ActiveSoftLock | undefined {
  return ALL_EDIT_OPERATIONS.find(
    d => d.operationRole?.kind === 'softLock' && d.operationRole.isActiveThisSession(row),
  ) as ActiveSoftLock | undefined
}

/**
 * `operationRole` を考慮した availableFor 判定。
 * 不可の場合は reason で理由を返す（UI tooltip・AI デバッグ用）。
 *
 * lock (strict): lockCancel 以外の全操作をブロック。同一 def は再編集可。
 * softLock:      他の lock/softLock 操作のみブロック。通常操作は通す。
 * lockCancel:    strict lock のみ対象（softLock のキャンセルは availableFor で制御）。
 */
export function resolveAvailability(
  def:     EditOperation,
  row:     AllocationRow,
  masters: AllMasters,
): AvailabilityResult {
  const forResult = def.availableFor(row, masters)
  if (!forResult.available) return forResult

  const activeStrictLock = ALL_EDIT_OPERATIONS.find(
    d => d.operationRole?.kind === 'lock' && d.operationRole.isActiveThisSession(row),
  )
  const activeSoftLock = getActiveSoftLock(row)

  if (def.operationRole?.kind === 'lockCancel') {
    if (activeStrictLock?.id === def.operationRole.of) return AVAILABLE
    return { available: false, reason: `${def.operationRole.of} がセッション内で有効でないため取消できません` }
  }

  if (activeStrictLock) {
    if (def.id === activeStrictLock.id) return AVAILABLE
    return { available: false, reason: `「${activeStrictLock.label}」が設定中のため他の操作はできません` }
  }

  if (activeSoftLock) {
    if (def.id === activeSoftLock.id) return AVAILABLE
    if (def.operationRole?.kind === 'lock' || def.operationRole?.kind === 'softLock') {
      return { available: false, reason: `「${activeSoftLock.label}」が設定中のため他のロック操作はできません` }
    }
    // 通常操作は許可（availableFor を通過済み）
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
  return op.createCommand(rowId, values)
}
