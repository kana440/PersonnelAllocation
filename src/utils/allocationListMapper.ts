import type { Person, Position, Affiliation, Organization, Company, Operation } from '../types/domain'
import type { AllocationList } from '../domain/csvImport/allocationList/schema'
import { resolveOrgHierarchy } from '../domain/csvImport/allocationList/orgHierarchy'

// ── Extended type: AllocationList + UI/sort metadata (not exported to Excel) ──
export type AllocationRow = AllocationList & {
  readonly _meta: {
    personId:      string
    companyId:     string
    companyName:   string
    hasSF:         boolean
    operationType: string   // 組織異動 / 昇格 / 変更なし etc.
    hasOperation:  boolean
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
export interface MapperInput {
  persons:            Person[]
  companies:          Company[]
  organizations:      Organization[]
  operations:         Operation[]
  beforeAffiliations: Affiliation[]
  beforePositions:    Position[]
  afterAffiliations:  Affiliation[]
  afterPositions:     Position[]
  effectiveDate:      string
  rawImportedRows?:   AllocationList[]
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function boolStr(v: boolean | undefined): string | undefined {
  if (v === undefined) return undefined
  return v ? '○' : ''
}

function buildAfterFields(
  aff:           Affiliation,
  allAffs:       Affiliation[],
  positions:     Position[],
  persons:       Person[],
  companies:     Company[],
  organizations: Organization[],
  effectiveDate: string,
): Partial<AllocationList> {
  const pos = positions.find(p => p.id === aff.positionId)
  if (!pos) return {}

  const orgHierarchy = resolveOrgHierarchy(pos.orgId, organizations, effectiveDate)

  const managerAff = aff.managerId
    ? allAffs.find(a =>
        a.personId === aff.managerId && a.status === 'active' &&
        positions.find(p => p.id === a.positionId)?.companyId === pos.companyId
      )
    : undefined
  const managerPos  = managerAff ? positions.find(p => p.id === managerAff.positionId) : undefined
  const manager     = aff.managerId ? persons.find(p => p.id === aff.managerId) : undefined

  const destCompanyId = aff.secondmentDestCompanyId
    ?? allAffs
      .filter(a => a.personId === aff.personId && a.status === 'active')
      .map(a => positions.find(p => p.id === a.positionId)?.companyId)
      .find((cid): cid is string => !!cid && cid !== pos.companyId)
  const destCompany   = destCompanyId ? companies.find(c => c.id === destCompanyId) : undefined
  const sourceCompany = aff.secondmentSourceCompanyId
    ? companies.find(c => c.id === aff.secondmentSourceCompanyId)
    : undefined

  return {
    employmentType:                aff.employmentType,
    concurrentType:                aff.type === 'primary' ? '本務' : '兼務',
    concurrentReason:              aff.concurrentReason,
    secondmentFromCompany:         sourceCompany?.name,
    secondmentFromEmployeeNumber:  aff.secondmentSourceEmployeeId,
    leaveFlag:                     boolStr(aff.isOnLeave),
    positionCode:                  pos.sfPositionId,
    departmentCode:                orgHierarchy?.departmentCode,
    businessUnit:                  orgHierarchy?.businessUnit,
    division:                      orgHierarchy?.division,
    subDivision:                   orgHierarchy?.subDivision,
    group:                         orgHierarchy?.group,
    team:                          orgHierarchy?.team,
    officialPositionCode:          pos.title,
    localJobTitle:                 aff.freeTitle,
    secondmentToCompany:           destCompany?.name,
    location:                      pos.workLocation,
    costCenter:                    pos.costCenter,
    managerPositionCode:           managerPos?.sfPositionId ?? pos.managerPositionCode,
    managerName:                   manager?.name,
    jobFamily:                     pos.jobFamily,
    jobType:                       pos.jobType,
    positionBand:                  pos.band,
    band:                          aff.individualBand,
    payGrade:                      aff.salaryGrade,
    trainingPositionFlag:          boolStr(pos.isTrainingPosition),
    nonUnionAgreementFlag:         boolStr(aff.isNonUnionAgreement),
    positionUnionFlag:             boolStr(pos.isUnionPosition),
    unionFlag:                     boolStr(aff.isUnionMember),
    positionDiscretionaryWorkFlag: boolStr(pos.isDiscretionaryLaborPosition),
    discretionaryWorkFlag:         boolStr(aff.isDiscretionaryLabor),
  }
}

function buildPrevFields(
  aff:           Affiliation,
  allAffs:       Affiliation[],
  positions:     Position[],
  persons:       Person[],
  companies:     Company[],
  organizations: Organization[],
): Partial<AllocationList> {
  const pos = positions.find(p => p.id === aff.positionId)
  if (!pos) return {}

  // Before state's org assignment started at aff.startDate
  const orgHierarchy = resolveOrgHierarchy(pos.orgId, organizations, aff.startDate)

  const managerAff = aff.managerId
    ? allAffs.find(a =>
        a.personId === aff.managerId && a.status === 'active' &&
        positions.find(p => p.id === a.positionId)?.companyId === pos.companyId
      )
    : undefined
  const managerPos  = managerAff ? positions.find(p => p.id === managerAff.positionId) : undefined
  const manager     = aff.managerId ? persons.find(p => p.id === aff.managerId) : undefined

  const destCompanyId = aff.secondmentDestCompanyId
    ?? allAffs
      .filter(a => a.personId === aff.personId && a.status === 'active')
      .map(a => positions.find(p => p.id === a.positionId)?.companyId)
      .find((cid): cid is string => !!cid && cid !== pos.companyId)
  const destCompany   = destCompanyId ? companies.find(c => c.id === destCompanyId) : undefined
  const sourceCompany = aff.secondmentSourceCompanyId
    ? companies.find(c => c.id === aff.secondmentSourceCompanyId)
    : undefined

  return {
    prevEmploymentType:                aff.employmentType,
    prevConcurrentType:                aff.type === 'primary' ? '本務' : '兼務',
    prevConcurrentReason:              aff.concurrentReason,
    prevSecondmentFromCompany:         sourceCompany?.name,
    prevSecondmentFromEmployeeNumber:  aff.secondmentSourceEmployeeId,
    prevLeaveFlag:                     boolStr(aff.isOnLeave),
    prevPositionCode:                  pos.sfPositionId,
    prevDepartmentCode:                orgHierarchy?.departmentCode,
    prevBusinessUnit:                  orgHierarchy?.businessUnit,
    prevDivision:                      orgHierarchy?.division,
    prevSubDivision:                   orgHierarchy?.subDivision,
    prevGroup:                         orgHierarchy?.group,
    prevTeam:                          orgHierarchy?.team,
    prevOfficialPositionCode:          pos.title,
    prevLocalJobTitle:                 aff.freeTitle,
    prevSecondmentToCompany:           destCompany?.name,
    prevLocation:                      pos.workLocation,
    prevCostCenter:                    pos.costCenter,
    prevManagerPositionCode:           managerPos?.sfPositionId ?? pos.managerPositionCode,
    prevManagerName:                   manager?.name,
    prevJobFamily:                     pos.jobFamily,
    prevJobType:                       pos.jobType,
    prevPositionBand:                  pos.band,
    prevBand:                          aff.individualBand,
    prevPayGrade:                      aff.salaryGrade,
    prevTrainingPositionFlag:          boolStr(pos.isTrainingPosition),
    prevNonUnionAgreementFlag:         boolStr(aff.isNonUnionAgreement),
    prevPositionUnionFlag:             boolStr(pos.isUnionPosition),
    prevUnionFlag:                     boolStr(aff.isUnionMember),
    prevPositionDiscretionaryWorkFlag: boolStr(pos.isDiscretionaryLaborPosition),
    prevDiscretionaryWorkFlag:         boolStr(aff.isDiscretionaryLabor),
  }
}

function deriveOperationType(
  beforeAff: Affiliation | undefined,
  afterAff:  Affiliation | undefined,
  beforePositions: Position[],
  afterPositions:  Position[],
): string {
  if (!beforeAff && afterAff) return '出向開始'
  if (beforeAff && !afterAff)  return '出向解除'
  if (!beforeAff || !afterAff) return '変更なし'
  const bp = beforePositions.find(p => p.id === beforeAff.positionId)
  const ap = afterPositions.find(p => p.id === afterAff.positionId)
  if (bp?.orgId !== ap?.orgId)       return '組織異動'
  if (bp?.band  !== ap?.band)        return '昇格'
  if (bp?.title !== ap?.title)       return '役職変更'
  return '変更なし'
}

// ── Main mapper (Domain state → AllocationRow[]) ───────────────────────────────

export function toAllocationRows(input: MapperInput): AllocationRow[] {
  const {
    persons, companies, organizations, operations,
    beforeAffiliations, beforePositions,
    afterAffiliations,  afterPositions,
    effectiveDate,
    rawImportedRows,
  } = input

  const allPersonIds = new Set<string>([
    ...beforeAffiliations.map(a => a.personId),
    ...afterAffiliations.map(a => a.personId),
  ])

  const domainRows: AllocationRow[] = []
  let no = 1

  for (const personId of allPersonIds) {
    const person = persons.find(p => p.id === personId)
    if (!person) continue

    const [lastName = person.name, firstName = ''] = person.name.split(' ')

    const companyIds = new Set<string>();
    [...beforeAffiliations, ...afterAffiliations]
      .filter(a => a.personId === personId)
      .forEach(a => {
        const pos = [...beforePositions, ...afterPositions].find(p => p.id === a.positionId)
        if (pos) companyIds.add(pos.companyId)
      })

    for (const companyId of companyIds) {
      const company = companies.find(c => c.id === companyId)
      if (!company) continue

      const beforeAff = beforeAffiliations.find(a =>
        a.personId === personId && a.status === 'active' &&
        beforePositions.find(p => p.id === a.positionId)?.companyId === companyId
      )
      const afterAff = afterAffiliations.find(a =>
        a.personId === personId && a.status === 'active' &&
        afterPositions.find(p => p.id === a.positionId)?.companyId === companyId
      )

      const primaryOp = operations.find((op: Operation) => {
        if (op.params.personId !== personId) return false
        return (
          op.params.companyId === companyId ||
          op.params.toCompanyId === companyId ||
          (op.params.orgId && organizations.find(o => o.id === op.params.orgId)?.companyId === companyId)
        )
      })

      const operationType = deriveOperationType(beforeAff, afterAff, beforePositions, afterPositions)

      const afterFields = afterAff
        ? buildAfterFields(afterAff, afterAffiliations, afterPositions, persons, companies, organizations, effectiveDate)
        : {}
      const prevFields = beforeAff
        ? buildPrevFields(beforeAff, beforeAffiliations, beforePositions, persons, companies, organizations)
        : {}

      const exclusionReason = !company.hasSF
        ? 'SF対象外'
        : !person.sfPersonId
          ? 'SFユーザーID未設定'
          : undefined

      domainRows.push({
        no:                 String(no++),
        userId:             person.sfPersonId ?? person.id,
        groupEmployeeId:    person.groupEmployeeId,
        employeeNumber:     person.employeeNumber,
        lastName,
        firstName,
        transferReason:     primaryOp?.transferReason,
        memo:               primaryOp?.memo,
        promotionSign:      primaryOp?.promotionSign ? '○' : undefined,
        demotionReason:     primaryOp?.demotionReason,
        payGradeChangeSign: primaryOp?.salaryGradeChangeSign ? '○' : undefined,
        ...afterFields,
        ...prevFields,
        exclusionReason,
        _meta: {
          personId,
          companyId,
          companyName:  company.name,
          hasSF:        company.hasSF,
          operationType,
          hasOperation: !!primaryOp,
        },
      })
    }
  }

  // rawImportedRows がなければ既存の domain-driven ソートで返す
  if (!rawImportedRows || rawImportedRows.length === 0) {
    return domainRows.sort((a, b) => {
      const aChanged = a._meta.operationType !== '変更なし' ? 0 : 1
      const bChanged = b._meta.operationType !== '変更なし' ? 0 : 1
      if (aChanged !== bChanged) return aChanged - bChanged
      if (a._meta.companyId !== b._meta.companyId) return a._meta.companyId.localeCompare(b._meta.companyId)
      return (a.lastName ?? '').localeCompare(b.lastName ?? '')
    })
  }

  // rawImportedRows を順序のベースとしてマージする
  // domain 行を userId でキュー化（同一 userId に複数行ある兼務ケースも対応）
  const byUserId = new Map<string, AllocationRow[]>()
  domainRows.forEach(r => {
    const k = r.userId ?? ''
    if (!byUserId.has(k)) byUserId.set(k, [])
    byUserId.get(k)!.push(r)
  })

  const result: AllocationRow[] = []
  let mergedNo = 1

  for (const raw of rawImportedRows) {
    const k = raw.userId ?? ''
    const queue = k ? byUserId.get(k) : undefined

    if (queue && queue.length > 0) {
      // domain 行が存在 → 計算済み状態を使用（FIFO で 1 件消費）
      result.push({ ...queue.shift()!, no: String(mergedNo++) })
    } else {
      // domain に取り込まれなかった行（スキップ行）→ raw データをそのまま出力
      result.push({
        ...raw,
        no: String(mergedNo++),
        _meta: {
          personId:      k,
          companyId:     '',
          companyName:   '',
          hasSF:         true,
          operationType: '変更なし',
          hasOperation:  false,
        },
      })
    }
  }

  // raw に存在しない domain 行（UI で追加した新規採用・余剰兼務行）を末尾に追加
  for (const queue of byUserId.values()) {
    for (const r of queue) {
      result.push({ ...r, no: String(mergedNo++) })
    }
  }

  return result
}
