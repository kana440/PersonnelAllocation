import type { OperationHandler } from './_types'
import { newAffId, newPosId } from './_ids'

export const hireHandler: OperationHandler = {
  kind: 'Hire',

  apply(state, op) {
    const { personId, orgId, companyId, band, title } = op.params
    const posId = newPosId()
    state.positions = [
      ...state.positions,
      { id: posId, orgId, companyId, title: title || '担当', band: band || 'B4', isVacant: false },
    ]
    state.affiliations = [
      ...state.affiliations,
      {
        id: newAffId(),
        personId, positionId: posId,
        type: 'primary' as const, status: 'active' as const,
        startDate: op.effectiveDate, employmentType: '正社員',
      },
    ]
  },
}
