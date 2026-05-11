import type { OperationHandler } from './_types'
import { newPosId } from './_ids'

export const createVacantPositionHandler: OperationHandler = {
  kind: 'CreateVacantPosition',

  apply(state, op) {
    const { orgId, companyId, title, band } = op.params
    state.positions = [
      ...state.positions,
      { id: newPosId(), orgId, companyId, title: title || '担当', band: band || 'B4', isVacant: true },
    ]
  },
}
