import type { ExcelRow, Affiliation, Position, Person, Organization, Company } from '../types/domain'

interface TranslatorInput {
  persons: Person[]
  companies: Company[]
  organizations: Organization[]
  beforeAffiliations: Affiliation[]
  beforePositions: Position[]
  afterAffiliations: Affiliation[]
  afterPositions: Position[]
  effectiveDate: string
}

export function translateToExcel(input: TranslatorInput): ExcelRow[] {
  const { persons, companies, organizations, beforeAffiliations, beforePositions, afterAffiliations, afterPositions, effectiveDate } = input

  const findOrg    = (id: string)  => organizations.find(o => o.id === id)
  const findPerson = (id?: string) => persons.find(p => p.id === id)
  const findCompany = (id: string) => companies.find(c => c.id === id)

  // All person IDs that appear anywhere (before or after)
  const allPersonIds = new Set<string>([
    ...beforeAffiliations.map(a => a.personId),
    ...afterAffiliations.map(a => a.personId),
  ])

  const rows: ExcelRow[] = []

  for (const personId of allPersonIds) {
    const person = findPerson(personId)
    if (!person) continue

    // All companies this person touches (before or after)
    const companyIds = new Set<string>()
    beforeAffiliations
      .filter(a => a.personId === personId)
      .forEach(a => {
        const pos = beforePositions.find(p => p.id === a.positionId)
        if (pos) companyIds.add(pos.companyId)
      })
    afterAffiliations
      .filter(a => a.personId === personId)
      .forEach(a => {
        const pos = afterPositions.find(p => p.id === a.positionId)
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

      const beforePos = beforeAff ? beforePositions.find(p => p.id === beforeAff.positionId) : undefined
      const afterPos  = afterAff  ? afterPositions.find(p  => p.id === afterAff.positionId)  : undefined

      const beforeOrg     = beforePos ? findOrg(beforePos.orgId)       : undefined
      const afterOrg      = afterPos  ? findOrg(afterPos.orgId)        : undefined
      const beforeManager = findPerson(beforeAff?.managerId)
      const afterManager  = findPerson(afterAff?.managerId)

      let opType = '変更なし'
      if (!beforeAff && afterAff)                               opType = '出向開始'
      else if (beforeAff && !afterAff)                          opType = '出向解除'
      else if (beforePos?.orgId  !== afterPos?.orgId)           opType = '組織異動'
      else if (beforePos?.band   !== afterPos?.band)            opType = '昇格'
      else if (beforePos?.title  !== afterPos?.title)           opType = '役職変更'

      rows.push({
        rowId:             `${personId}_${companyId}`,
        personId,
        personName:        person.name,
        companyId,
        companyName:       company.name,
        hasSF:             company.hasSF,
        operationType:     opType,
        effectiveDate,
        beforeOrgName:     beforeOrg?.name,
        beforeTitle:       beforePos?.title,
        beforeBand:        beforePos?.band,
        beforeManagerName: beforeManager?.name,
        beforePositionId:  beforePos?.sfPositionId,
        afterOrgName:      afterOrg?.name,
        afterTitle:        afterPos?.title,
        afterBand:         afterPos?.band,
        afterManagerName:  afterManager?.name,
        afterPositionId:   afterPos?.sfPositionId,
        sfPersonId:        person.sfPersonId,
        notes:             !company.hasSF ? 'SF未導入会社' : undefined,
      })
    }
  }

  // Sort: changed rows first, then by company, then by person name
  return rows.sort((a, b) => {
    const aChanged = a.operationType !== '変更なし' ? 0 : 1
    const bChanged = b.operationType !== '変更なし' ? 0 : 1
    if (aChanged !== bChanged) return aChanged - bChanged
    if (a.companyId !== b.companyId) return a.companyId.localeCompare(b.companyId)
    return a.personName.localeCompare(b.personName)
  })
}
