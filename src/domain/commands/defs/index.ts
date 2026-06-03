/**
 * 操作定義レジストリ
 *
 * すべての OperationDef をここからエクスポートする。
 * UI・AI は ALL_OPERATION_DEFS を使って利用可能な操作を列挙し、
 * availableFor() でその行に適用できるかを判定する。
 *
 * 新しい操作を追加するときは:
 *   1. 対応する EditCommand を src/domain/commands/handlers/ に追加
 *   2. 操作グループに応じた defs/*.ts ファイルに OperationDef を追加
 *   3. ここの ALL_OPERATION_DEFS に追加
 */

export type { OperationDef, OperationGroup, OperationInput } from './types'
export { isRegularEmployee, isSecondmentAcceptance, isMainAssignment, wasSecondedOut, wasSecondedIn } from '../helpers'

// ── 職務情報操作 ──────────────────────────────────────────────────────────────
export {
  promotionDef,
  demotionDef,
  titleChangeDef,
  jobTypeChangeDef,
  employmentExtensionDef,
} from './jobClassificationDefs'

// ── ポジション操作 ────────────────────────────────────────────────────────────
export {
  orgTransferDef,
  orgRestructureDef,
  managerChangeDef,
  concurrentAddDef,
  concurrentReleaseDef,
} from './positionDefs'

// ── 出向操作 ──────────────────────────────────────────────────────────────────
export {
  secondmentOutSFDef,
  secondmentOutNonSFDef,
  secondmentInSFDef,
  secondmentInNonSFDef,
  concurrentSecondmentOutSFDef,
  concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,
  concurrentSecondmentInNonSFDef,
  // 解除（SF区別あり）
  secondmentOutReleaseSFDef,
  secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,
  secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef,
  concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,
  concurrentSecondmentInReleaseNonSFDef,
} from './secondmentDefs'

// ── 人操作 ────────────────────────────────────────────────────────────────────
export {
  leaveOfAbsenceDef,
  returnFromLeaveDef,
  employmentTransferOutDef,
  employmentTransferInDef,
  noChangeDef,
} from './personDefs'

import type { OperationDef } from './types'
import {
  promotionDef, demotionDef, titleChangeDef, jobTypeChangeDef, employmentExtensionDef,
} from './jobClassificationDefs'
import {
  orgTransferDef, orgRestructureDef, managerChangeDef, concurrentAddDef, concurrentReleaseDef,
} from './positionDefs'
import {
  secondmentOutSFDef, secondmentOutNonSFDef,
  secondmentInSFDef, secondmentInNonSFDef,
  concurrentSecondmentOutSFDef, concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef, concurrentSecondmentInNonSFDef,
  secondmentOutReleaseSFDef, secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef, secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef, concurrentSecondmentInReleaseNonSFDef,
} from './secondmentDefs'
import {
  leaveOfAbsenceDef, returnFromLeaveDef,
  employmentTransferOutDef, employmentTransferInDef, noChangeDef,
} from './personDefs'

/**
 * 全操作定義リスト。
 * メニュー表示順は業務の文脈に合わせてグループ内で並べる。
 */
export const ALL_OPERATION_DEFS: OperationDef[] = [
  // 職務情報操作
  promotionDef,
  demotionDef,
  titleChangeDef,
  jobTypeChangeDef,
  employmentExtensionDef,

  // ポジション操作
  orgTransferDef,
  orgRestructureDef,
  managerChangeDef,
  concurrentAddDef,
  concurrentReleaseDef,

  // 出向操作（SF導入先）
  secondmentOutSFDef,
  secondmentInSFDef,
  secondmentOutReleaseSFDef,
  secondmentInReleaseSFDef,
  concurrentSecondmentOutSFDef,
  concurrentSecondmentInSFDef,
  concurrentSecondmentOutReleaseSFDef,
  concurrentSecondmentInReleaseSFDef,

  // 出向操作（SF未導入先）
  secondmentOutNonSFDef,
  secondmentInNonSFDef,
  secondmentOutReleaseNonSFDef,
  secondmentInReleaseNonSFDef,
  concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInNonSFDef,
  concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseNonSFDef,

  // 人操作
  leaveOfAbsenceDef,
  returnFromLeaveDef,
  employmentTransferOutDef,
  employmentTransferInDef,
  noChangeDef,
]
