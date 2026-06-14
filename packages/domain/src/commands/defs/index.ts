/**
 * 操作定義レジストリ
 *
 * すべての OperationDef をここからエクスポートする。
 * UI・AI は ALL_OPERATION_DEFS を使って利用可能な操作を列挙し、
 * availableFor() でその行に適用できるかを判定する。
 *
 * 新しい操作を追加するときは:
 *   1. 対応する EditCommand を src/domain/commands/handlers/ に追加
 *   2. 対応するセクションの defs/*.ts ファイルに OperationDef と DEFS への追加
 *   3. ここの再エクスポートに追加
 */

export type { OperationDef, OperationGroup, OperationInput } from './types'
export { isRegularEmployee, isSecondmentAcceptance, isMainAssignment, wasSecondedOut, wasSecondedIn } from '../helpers'

// ── 昇降格・役職変更 ──────────────────────────────────────────────────────────
export { promotionDef, demotionDef, titleChangeDef } from './promotionDefs'

// ── 職務内容・雇用形態 ────────────────────────────────────────────────────────
export { jobTypeChangeDef, employmentExtensionDef } from './employmentTypeDefs'

// ── 組織への異動 ──────────────────────────────────────────────────────────────
export { orgTransferDef, orgRestructureDef, managerChangeDef } from './orgTransferDefs'

// ── 兼務 ─────────────────────────────────────────────────────────────────────
export { concurrentAddDef, concurrentReleaseDef } from './concurrentDefs'

// ── 出向 ─────────────────────────────────────────────────────────────────────
export {
  secondmentOutSFDef, secondmentOutNonSFDef,
  secondmentInSFDef,  secondmentInNonSFDef,
  concurrentSecondmentOutSFDef,    concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,     concurrentSecondmentInNonSFDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
} from './secondmentDefs'

// ── 在籍・退職 ────────────────────────────────────────────────────────────────
export { leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef, employmentTransferOutDef, employmentTransferInDef, noChangeDef } from './personDefs'

import type { OperationDef } from './types'
import { DEFS as promotion }       from './promotionDefs'
import { DEFS as employmentType }  from './employmentTypeDefs'
import { DEFS as orgTransfer }     from './orgTransferDefs'
import { DEFS as concurrent }      from './concurrentDefs'
import { DEFS as secondment }      from './secondmentDefs'
import { DEFS as person }          from './personDefs'

export const ALL_OPERATION_DEFS: OperationDef[] = [
  ...promotion,
  ...employmentType,
  ...orgTransfer,
  ...concurrent,
  ...secondment,
  ...person,
]
