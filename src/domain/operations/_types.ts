import type { Affiliation, Operation, OperationKind, Position, Organization } from '../schemas'

// applyOperations が各ハンドラーに渡す可変状態
export interface MutableState {
  affiliations:  Affiliation[]
  positions:     Position[]
  organizations: Organization[]
}

export interface OperationHandler {
  kind: OperationKind

  // 状態変換ロジック（applyOperations の if-else から移植）
  apply(state: MutableState, op: Operation): void

  // 追加前処理（HRApplicationService.addOperation の重複・相殺ルール）
  // Operation[] を返す → フィルタ済み ops に差し替えてから新規追加
  // null を返す       → 対になる既存操作を除去して新規追加はしない（相殺）
  preAdd?(
    ops:   Operation[],
    newOp: Omit<Operation, 'id' | 'order'>,
  ): Operation[] | null
}
