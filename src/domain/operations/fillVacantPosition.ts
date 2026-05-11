import type { OperationHandler } from './_types'
import { newAffId } from './_ids'

export const fillVacantPositionHandler: OperationHandler = {
  kind: 'FillVacantPosition',

  preAdd(ops, newOp) {
    // 同じポジションへの既存割り当ては上書き（後勝ち）
    const filtered = ops.filter(o =>
      !(o.kind === 'FillVacantPosition' && o.params.positionId === newOp.params.positionId)
    )
    return filtered.length !== ops.length ? filtered : ops
  },

  apply(state, op) {
    const { positionId, personId, employmentType, asConcurrent } = op.params
    const pos = state.positions.find(p => p.id === positionId)
    if (!pos) return

    const concurrent = asConcurrent === 'true'

    if (!concurrent) {
      // 同社のプライマリ所属を終了（異動の場合のみ）
      state.affiliations = state.affiliations.map(a => {
        if (a.personId !== personId || a.type !== 'primary' || a.status !== 'active') return a
        const existingPos = state.positions.find(ep => ep.id === a.positionId)
        if (!existingPos || existingPos.companyId !== pos.companyId) return a
        return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
      })
    }

    // ポジションを在職済みにマーク
    state.positions = state.positions.map(p =>
      p.id === positionId ? { ...p, isVacant: false } : p
    )

    // 職務情報（Affiliation）を作成
    state.affiliations = [
      ...state.affiliations,
      {
        id: newAffId(),
        personId, positionId,
        type: concurrent ? 'concurrent' as const : 'primary' as const,
        status: 'active' as const,
        startDate: op.effectiveDate,
        employmentType: employmentType || (concurrent ? '兼務' : '正社員'),
      },
    ]
  },
}
