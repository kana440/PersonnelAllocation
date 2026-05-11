import type { OperationHandler } from './_types'
import { newAffId, newPosId } from './_ids'

export const addConcurrentHandler: OperationHandler = {
  kind: 'AddConcurrent',

  preAdd(ops, newOp) {
    // 対になる RemoveConcurrent があれば相殺
    const paired = ops.find(o =>
      o.kind === 'RemoveConcurrent' &&
      o.params.personId === newOp.params.personId &&
      o.params.orgId    === newOp.params.orgId
    )
    return paired ? null : ops
  },

  apply(state, op) {
    const { personId, orgId, band, title, companyId } = op.params
    const posId = newPosId()
    state.positions = [
      ...state.positions,
      { id: posId, orgId, companyId, title: title || '兼務', band: band || 'B4', isVacant: false },
    ]
    state.affiliations = [
      ...state.affiliations,
      {
        id: newAffId(),
        personId, positionId: posId,
        type: 'concurrent' as const, status: 'active' as const,
        startDate: op.effectiveDate, employmentType: '兼務',
        concurrentReason: op.params.concurrentReason,
      },
    ]
  },
}
