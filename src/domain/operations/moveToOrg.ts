import type { OperationHandler } from './_types'
import { newAffId, newPosId } from './_ids'

export const moveToOrgHandler: OperationHandler = {
  kind: 'MoveToOrg',

  preAdd(ops, newOp) {
    // 同一人・同一会社の既存異動を除去（上書き）
    return ops.filter(o => !(
      o.kind === 'MoveToOrg' &&
      o.params.personId  === newOp.params.personId &&
      o.params.companyId === newOp.params.companyId
    ))
  },

  apply(state, op) {
    const { personId, toOrgId, band, title, companyId } = op.params
    const prevAff = state.affiliations.find(a =>
      a.personId === personId && a.status === 'active' && a.type === 'primary' &&
      state.positions.find(p => p.id === a.positionId)?.companyId === companyId
    )
    state.affiliations = state.affiliations.map(a => {
      if (a.personId !== personId || a.status !== 'active' || a.type !== 'primary') return a
      const pos = state.positions.find(p => p.id === a.positionId)
      if (!pos || pos.companyId !== companyId) return a
      return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
    })
    const posId = newPosId()
    state.positions = [
      ...state.positions,
      { id: posId, orgId: toOrgId, companyId, title: title || '担当', band: band || 'B4', isVacant: false },
    ]
    state.affiliations = [
      ...state.affiliations,
      {
        id: newAffId(),
        personId, positionId: posId,
        type: 'primary' as const, status: 'active' as const,
        startDate: op.effectiveDate,
        employmentType:       prevAff?.employmentType,
        salaryGrade:          prevAff?.salaryGrade,
        isUnionMember:        prevAff?.isUnionMember,
        isDiscretionaryLabor: prevAff?.isDiscretionaryLabor,
      },
    ]
  },
}
