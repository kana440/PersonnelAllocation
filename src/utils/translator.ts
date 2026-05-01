import type { ExcelRow, PositionSnapshot, Affiliation, Position, Person, Organization, Company, Operation } from '../types/domain'

interface TranslatorInput {
  persons: Person[]
  companies: Company[]
  organizations: Organization[]
  operations: Operation[]
  beforeAffiliations: Affiliation[]
  beforePositions: Position[]
  afterAffiliations: Affiliation[]
  afterPositions: Position[]
  effectiveDate: string
}

function buildSnapshot(
  aff: Affiliation | undefined,
  allAffs: Affiliation[],
  positions: Position[],
  persons: Person[],
  companies: Company[],
  organizations: Organization[],
): PositionSnapshot | null {
  if (!aff) return null
  const pos = positions.find(p => p.id === aff.positionId)
  if (!pos) return null
  const org = organizations.find(o => o.id === pos.orgId)

  // Manager info: find manager's active affiliation in same company
  const managerAff = aff.managerId
    ? allAffs.find(a =>
        a.personId === aff.managerId && a.status === 'active' &&
        positions.find(p => p.id === a.positionId)?.companyId === pos.companyId
      )
    : undefined
  const managerPos = managerAff ? positions.find(p => p.id === managerAff.positionId) : undefined
  const manager    = aff.managerId ? persons.find(p => p.id === aff.managerId) : undefined

  // 出向先会社: other active companies this person works at
  const destCompanyIds = allAffs
    .filter(a => a.personId === aff.personId && a.status === 'active')
    .map(a => positions.find(p => p.id === a.positionId)?.companyId)
    .filter((cid): cid is string => !!cid && cid !== pos.companyId)
  const destCompany = destCompanyIds[0] ? companies.find(c => c.id === destCompanyIds[0]) : undefined

  // 出向元会社
  const sourceCompany = aff.secondmentSourceCompanyId
    ? companies.find(c => c.id === aff.secondmentSourceCompanyId)
    : undefined

  return {
    employmentType:             aff.employmentType,
    concurrentType:             aff.type === 'primary' ? '本務' : '兼務',
    concurrentReason:           aff.concurrentReason,
    secondmentSourceCompany:    sourceCompany?.name,
    secondmentSourceEmployeeId: aff.secondmentSourceEmployeeId,
    isOnLeave:                  aff.isOnLeave,
    positionCode:               pos.sfPositionId,
    orgCode:                    org?.id,
    jobTitle:                   pos.title,
    freeTitle:                  aff.freeTitle,
    secondmentDestCompany:      destCompany?.name,
    workLocation:               pos.workLocation,
    costCenter:                 pos.costCenter,
    managerPositionCode:        managerPos?.sfPositionId,
    managerName:                manager?.name,
    jobFamily:                  pos.jobFamily,
    jobType:                    pos.jobType,
    positionBand:               pos.band,
    individualBand:             aff.individualBand,
    salaryGrade:                aff.salaryGrade,
    isTrainingPosition:         pos.isTrainingPosition,
    isNonUnionAgreement:        aff.isNonUnionAgreement,
    isUnionPosition:            pos.isUnionPosition,
    isUnionMember:              aff.isUnionMember,
    isDiscretionaryLaborPosition: pos.isDiscretionaryLaborPosition,
    isDiscretionaryLabor:       aff.isDiscretionaryLabor,
  }
}

export function translateToExcel(input: TranslatorInput): ExcelRow[] {
  const { persons, companies, organizations, operations, beforeAffiliations, beforePositions, afterAffiliations, afterPositions, effectiveDate } = input

  const findPerson  = (id?: string) => persons.find(p => p.id === id)
  const findCompany = (id: string)  => companies.find(c => c.id === id)

  const allPersonIds = new Set<string>([
    ...beforeAffiliations.map(a => a.personId),
    ...afterAffiliations.map(a => a.personId),
  ])

  const rows: ExcelRow[] = []

  for (const personId of allPersonIds) {
    const person = findPerson(personId)
    if (!person) continue

    const [lastName = person.name, firstName = ''] = person.name.split(' ')

    // Collect all company IDs this person appears in
    const companyIds = new Set<string>()
    ;[...beforeAffiliations, ...afterAffiliations]
      .filter(a => a.personId === personId)
      .forEach(a => {
        const pos = [...beforePositions, ...afterPositions].find(p => p.id === a.positionId)
        if (pos) companyIds.add(pos.companyId)
      })

    for (const companyId of companyIds) {
      const company = findCompany(companyId)
      if (!company) continue

      const beforeAff = beforeAffiliations.find(a =>
        a.personId === personId && a.status === 'active' &&
        beforePositions.find(p => p.id === a.positionId)?.companyId === companyId
      )
      const afterAff = afterAffiliations.find(a =>
        a.personId === personId && a.status === 'active' &&
        afterPositions.find(p => p.id === a.positionId)?.companyId === companyId
      )

      const beforeSnap = buildSnapshot(beforeAff, beforeAffiliations, beforePositions, persons, companies, organizations)
      const afterSnap  = buildSnapshot(afterAff,  afterAffiliations,  afterPositions,  persons, companies, organizations)

      // Determine operation type
      let operationType = '変更なし'
      const beforePos = beforeAff ? beforePositions.find(p => p.id === beforeAff.positionId) : undefined
      const afterPos  = afterAff  ? afterPositions.find(p => p.id === afterAff.positionId)   : undefined
      if      (!beforeAff && afterAff)                               operationType = '出向開始'
      else if (beforeAff  && !afterAff)                              operationType = '出向解除'
      else if (beforePos?.orgId !== afterPos?.orgId)                 operationType = '組織異動'
      else if (beforePos?.band !== afterPos?.band)                   operationType = '昇格'
      else if (beforePos?.title !== afterPos?.title)                 operationType = '役職変更'

      // Find the most relevant operation for this person+company
      const relevantOps = operations.filter(op => {
        if (op.params.personId !== personId) return false
        return (
          op.params.companyId === companyId ||
          op.params.toCompanyId === companyId ||
          (op.params.orgId && organizations.find(o => o.id === op.params.orgId)?.companyId === companyId)
        )
      })
      const primaryOp = relevantOps[0]

      rows.push({
        rowId:         `${personId}_${companyId}`,
        personId,
        personName:    person.name,
        companyId,
        companyName:   company.name,
        hasSF:         company.hasSF,
        effectiveDate,
        operationType,
        // 本人情報
        sfPersonId:    person.sfPersonId,
        lastName,
        firstName,
        // 変更区分 (from operation)
        transferReason:       primaryOp?.transferReason,
        memo:                 primaryOp?.memo,
        promotionSign:        primaryOp?.promotionSign,
        demotionReason:       primaryOp?.demotionReason,
        salaryGradeChangeSign: primaryOp?.salaryGradeChangeSign,
        // After / Before
        after: afterSnap,
        before: beforeSnap,
      })
    }
  }

  return rows.sort((a, b) => {
    const aChanged = a.operationType !== '変更なし' ? 0 : 1
    const bChanged = b.operationType !== '変更なし' ? 0 : 1
    if (aChanged !== bChanged) return aChanged - bChanged
    if (a.companyId !== b.companyId) return a.companyId.localeCompare(b.companyId)
    return a.personName.localeCompare(b.personName)
  })
}
