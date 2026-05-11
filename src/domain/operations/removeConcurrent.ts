import type { OperationHandler } from './_types'

export const removeConcurrentHandler: OperationHandler = {
  kind: 'RemoveConcurrent',

  preAdd(ops, newOp) {
    // 対になる AddConcurrent があれば相殺
    const paired = ops.find(o =>
      o.kind === 'AddConcurrent' &&
      o.params.personId === newOp.params.personId &&
      o.params.orgId    === newOp.params.orgId
    )
    return paired ? null : ops
  },

  apply(state, op) {
    const { personId, orgId } = op.params
    state.affiliations = state.affiliations.map(a => {
      if (a.personId !== personId || a.type !== 'concurrent' || a.status !== 'active') return a
      const pos = state.positions.find(p => p.id === a.positionId)
      if (!pos || pos.orgId !== orgId) return a
      return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
    })
  },
}
