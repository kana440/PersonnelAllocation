import type { Affiliation, Operation, Position, Organization } from '../types/domain'

let posCounter = 100
let affCounter = 100

export function applyOperations(
  beforeAffiliations: Affiliation[],
  beforePositions: Position[],
  operations: Operation[],
  organizations: Organization[],
): { affiliations: Affiliation[]; positions: Position[] } {
  let affiliations = beforeAffiliations.map(a => ({ ...a }))
  let positions = beforePositions.map(p => ({ ...p }))

  const sorted = [...operations].sort((a, b) => a.order - b.order)

  for (const op of sorted) {
    if (op.kind === 'RecallFromSecondment') {
      const { personId, companyId } = op.params
      // End affiliations in this company for this person
      affiliations = affiliations.map(a => {
        if (a.personId !== personId || a.status !== 'active') return a
        const pos = positions.find(p => p.id === a.positionId)
        if (!pos || pos.companyId !== companyId) return a
        return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
      })
      // Mark positions vacant
      positions = positions.map(p => {
        if (p.companyId !== companyId) return p
        const wasOccupied = beforeAffiliations.some(
          a => a.positionId === p.id && a.personId === personId && a.status === 'active'
        )
        return wasOccupied ? { ...p, isVacant: true } : p
      })
    } else if (op.kind === 'SendOnSecondment') {
      const { personId, toCompanyId, orgId, band, title } = op.params
      void organizations.find(o => o.id === orgId)
      const hasSF = toCompanyId !== 'comp_c'
      const newPosId = `pos_new_${posCounter++}`
      // Find home company to record as secondment source
      const homeAff = affiliations.find(a =>
        a.personId === personId && a.status === 'active' && a.type === 'primary' &&
        positions.find(p => p.id === a.positionId)?.companyId !== toCompanyId
      )
      const homeCompanyId = homeAff ? positions.find(p => p.id === homeAff.positionId)?.companyId : undefined
      positions = [
        ...positions,
        {
          id: newPosId,
          orgId,
          companyId: toCompanyId,
          title: title || '担当',
          band: band || 'B4',
          isVacant: false,
          sfPositionId: hasSF ? `P_NEW_${posCounter}` : undefined,
        },
      ]
      affiliations = [
        ...affiliations,
        {
          id: `aff_new_${affCounter++}`,
          personId,
          positionId: newPosId,
          type: 'primary' as const,
          status: 'active' as const,
          startDate: op.effectiveDate,
          employmentType: '出向',
          secondmentSourceCompanyId: homeCompanyId,
          secondmentSourceEmployeeId: homeAff ? undefined : undefined,
        },
      ]
    } else if (op.kind === 'MoveToOrg') {
      const { personId, toOrgId, band, title, companyId } = op.params
      // Carry individual fields from the affiliation being ended
      const prevAff = affiliations.find(a =>
        a.personId === personId && a.status === 'active' && a.type === 'primary' &&
        positions.find(p => p.id === a.positionId)?.companyId === companyId
      )
      affiliations = affiliations.map(a => {
        if (a.personId !== personId || a.status !== 'active' || a.type !== 'primary') return a
        const pos = positions.find(p => p.id === a.positionId)
        if (!pos || pos.companyId !== companyId) return a
        return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
      })
      const newPosId = `pos_new_${posCounter++}`
      positions = [
        ...positions,
        {
          id: newPosId,
          orgId: toOrgId,
          companyId,
          title: title || '担当',
          band: band || 'B4',
          isVacant: false,
        },
      ]
      affiliations = [
        ...affiliations,
        {
          id: `aff_new_${affCounter++}`,
          personId,
          positionId: newPosId,
          type: 'primary' as const,
          status: 'active' as const,
          startDate: op.effectiveDate,
          employmentType: prevAff?.employmentType,
          salaryGrade: prevAff?.salaryGrade,
          isUnionMember: prevAff?.isUnionMember,
          isDiscretionaryLabor: prevAff?.isDiscretionaryLabor,
        },
      ]
    } else if (op.kind === 'AddConcurrent') {
      const { personId, orgId, band, title, companyId } = op.params
      const newPosId = `pos_new_${posCounter++}`
      positions = [
        ...positions,
        {
          id: newPosId,
          orgId,
          companyId,
          title: title || '兼務',
          band: band || 'B4',
          isVacant: false,
        },
      ]
      affiliations = [
        ...affiliations,
        {
          id: `aff_new_${affCounter++}`,
          personId,
          positionId: newPosId,
          type: 'concurrent' as const,
          status: 'active' as const,
          startDate: op.effectiveDate,
          employmentType: '兼務',
          concurrentReason: op.params.concurrentReason,
        },
      ]
    } else if (op.kind === 'RemoveConcurrent') {
      const { personId, orgId } = op.params
      affiliations = affiliations.map(a => {
        if (a.personId !== personId || a.type !== 'concurrent' || a.status !== 'active') return a
        const pos = positions.find(p => p.id === a.positionId)
        if (!pos || pos.orgId !== orgId) return a
        return { ...a, status: 'ended' as const, endDate: op.effectiveDate }
      })
    } else if (op.kind === 'Promote') {
      const { personId, companyId, band } = op.params
      positions = positions.map(p => {
        if (p.companyId !== companyId) return p
        const isOccupied = affiliations.some(
          a => a.positionId === p.id && a.personId === personId && a.status === 'active'
        )
        return isOccupied ? { ...p, band } : p
      })
      // Update salary grade in affiliation to match new band
      const bandGradeMap: Record<string, string> = {
        B7: '7等級', B6: '6等級', B5: '5等級', B4: '4等級', B3: '3等級', B2: '2等級', B1: '1等級',
      }
      affiliations = affiliations.map(a => {
        if (a.personId !== personId || a.status !== 'active') return a
        const pos = positions.find(p => p.id === a.positionId)
        if (!pos || pos.companyId !== companyId) return a
        return { ...a, salaryGrade: bandGradeMap[band] ?? a.salaryGrade }
      })
    }
  }

  return { affiliations, positions }
}
