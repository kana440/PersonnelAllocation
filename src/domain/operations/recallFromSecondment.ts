import type { OperationHandler } from './_types'

export const recallFromSecondmentHandler: OperationHandler = {
  kind: 'RecallFromSecondment',

  preAdd(ops, newOp) {
    // 対になる SendOnSecondment があれば相殺（双方を除去して追加しない）
    const paired = ops.find(o =>
      o.kind === 'SendOnSecondment' &&
      o.params.personId    === newOp.params.personId &&
      o.params.toCompanyId === newOp.params.companyId
    )
    return paired ? null : ops
  },

  apply(state, op) {
    const { personId, companyId } = op.params
    state.affiliations = state.affiliations.map(a => {
      if (a.personId !== personId || a.status !== 'active') return a
      const pos = state.positions.find(p => p.id === a.positionId)
      if (!pos || pos.companyId !== companyId) return a
      return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
    })
    state.positions = state.positions.map(p => {
      if (p.companyId !== companyId) return p
      const wasOccupied = state.affiliations.some(
        a => a.positionId === p.id && a.personId === personId && a.status === 'active'
      )
      return wasOccupied ? { ...p, isVacant: true } : p
    })
  },
}
