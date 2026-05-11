import type { OperationHandler } from './_types'

const BAND_GRADE: Record<string, string> = {
  B7: '7等級', B6: '6等級', B5: '5等級',
  B4: '4等級', B3: '3等級', B2: '2等級', B1: '1等級',
}

export const promoteHandler: OperationHandler = {
  kind: 'Promote',

  preAdd(ops, newOp) {
    // 同一人・同一会社の既存昇降格を除去（上書き）
    return ops.filter(o => !(
      o.kind === 'Promote' &&
      o.params.personId  === newOp.params.personId &&
      o.params.companyId === newOp.params.companyId
    ))
  },

  apply(state, op) {
    const { personId, companyId, band } = op.params
    state.positions = state.positions.map(p => {
      if (p.companyId !== companyId) return p
      const isOccupied = state.affiliations.some(
        a => a.positionId === p.id && a.personId === personId && a.status === 'active'
      )
      return isOccupied ? { ...p, band } : p
    })
    state.affiliations = state.affiliations.map(a => {
      if (a.personId !== personId || a.status !== 'active') return a
      const pos = state.positions.find(p => p.id === a.positionId)
      if (!pos || pos.companyId !== companyId) return a
      return { ...a, salaryGrade: BAND_GRADE[band] ?? a.salaryGrade }
    })
  },
}
