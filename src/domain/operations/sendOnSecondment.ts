import type { OperationHandler } from './_types'
import { newAffId, newPosId } from './_ids'

export const sendOnSecondmentHandler: OperationHandler = {
  kind: 'SendOnSecondment',

  apply(state, op) {
    const { personId, toCompanyId, orgId, band, title } = op.params
    const hasSF = toCompanyId !== 'comp_c'
    const posId = newPosId()
    const homeAff = state.affiliations.find(a =>
      a.personId === personId && a.status === 'active' && a.type === 'primary' &&
      state.positions.find(p => p.id === a.positionId)?.companyId !== toCompanyId
    )
    const homeCompanyId = homeAff
      ? state.positions.find(p => p.id === homeAff.positionId)?.companyId
      : undefined
    state.positions = [
      ...state.positions,
      {
        id: posId, orgId, companyId: toCompanyId,
        title: title || '担当', band: band || 'B4', isVacant: false,
        sfPositionId: hasSF ? `P_NEW_${posId}` : undefined,
      },
    ]
    state.affiliations = [
      ...state.affiliations,
      {
        id: newAffId(),
        personId, positionId: posId,
        type: 'primary' as const, status: 'active' as const,
        startDate: op.effectiveDate, employmentType: '出向',
        secondmentSourceCompanyId: homeCompanyId,
      },
    ]
  },
}
