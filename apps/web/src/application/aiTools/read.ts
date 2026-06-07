import type { HRApplicationService } from '../HRApplicationService'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'
import { detectChanges } from '@personnel/domain/patterns/changeDetection'
import { deriveEditPatterns } from '@personnel/domain/patterns/editPatternMatcher'
import { EDIT_PATTERN_META } from '@personnel/domain/patterns/editPatterns'
import { ALL_OPERATION_DEFS } from '@personnel/domain/commands/defs'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { getFieldOptions as getFieldOptionsFromDomain } from '@personnel/domain/choices'
import type { OrgTreeNode, SelectedRowContext } from '../aiTypes'
import type { PersonSearchResult, PersonDetail, VacantPositionResult } from './types'
import { buildOrgTree } from './orgTree'

export function createReadMethods(service: HRApplicationService) {

  function findPersons(query: {
    name?:    string
    userId?:  string
    orgCode?: string
  }): PersonSearchResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const byUserId = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.userId) continue
      const bucket = byUserId.get(row.userId) ?? []
      bucket.push(row)
      byUserId.set(row.userId, bucket)
    }
    const results: PersonSearchResult[] = []
    for (const [userId, rows] of byUserId) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      if (query.name    && !name.includes(query.name))              continue
      if (query.userId  && !userId.includes(query.userId))           continue
      if (query.orgCode && primary.departmentCode !== query.orgCode) continue
      const org = afterOrganizations.find(
        o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
      )
      results.push({ userId, name, orgCode: primary.departmentCode ?? '', orgName: org?.name, rowIds: rows.map(r => r.rowId) })
    }
    return results
  }

  function findOrgs(query: { name?: string; code?: string; company?: string }): Organization[] {
    const { afterOrganizations } = service.getSnapshot()
    return afterOrganizations.filter(o => {
      if (query.name    && !o.name.includes(query.name))                  return false
      if (query.code    && !(o.externalCode ?? o.id).includes(query.code)) return false
      if (query.company && o.companyId !== query.company)                  return false
      return true
    })
  }

  function getPersonRows(userId: string): AllocationRow[] {
    return service.getSnapshot().allocationList.filter(r => r.userId === userId)
  }

  function getRow(rowId: number): AllocationRow | undefined {
    return service.getSnapshot().allocationList.find(r => r.rowId === rowId)
  }

  function getOrgs():    Organization[] { return service.getSnapshot().afterOrganizations }
  function getPersons(): Person[]       { return service.getSnapshot().persons }

  /** 選択行のコンテキスト情報を返す。buildSystemPrompt に渡すために使う。 */
  function getRowContext(rowId: number): SelectedRowContext | null {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return null

    const name    = [row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`
    const org     = afterOrganizations.find(o => (o.externalCode ?? o.id) === row.departmentCode)
    const changes = detectChanges(row)
    const issues  = validateRow({ row, afterOrganizations, codeLists, allocationList, changes })

    // 現在の変更種別ラベル
    const { active } = deriveEditPatterns(changes.kinds, row, codeLists)
    const changeKinds = active.map(p => EDIT_PATTERN_META[p]?.label ?? p)

    // この行で実行可能な操作
    const availableOps = ALL_OPERATION_DEFS
      .filter(def => def.availableFor(row, codeLists))
      .map(def => def.label)

    return {
      rowId,
      userId:    row.userId ?? undefined,
      name,
      orgName:   org?.name ?? row.departmentCode ?? '',
      orgCode:   row.departmentCode ?? undefined,
      issues:    issues.map(i => ({ field: String(i.field), level: i.level, message: i.message })),
      changeKinds,
      availableOps,
      keyFields: {
        employmentType:       row.employmentType      as string | undefined,
        band:                 row.band                as string | undefined,
        payGrade:             row.payGrade            as string | undefined,
        officialPositionCode: row.officialPositionCode as string | undefined,
        leaveOfAbsenceSign:   row.leaveOfAbsenceSign  as string | undefined,
        concurrentType:       row.concurrentType      as string | undefined,
        positionCode:         row.positionCode        as string | undefined,
      },
    }
  }

  /**
   * 指定行の現在の状態に基づき、フィールドの有効な選択肢を返す。
   * VALUE_RULES の条件付きルールが自動適用される。自己修復時の値確認に使う。
   */
  function getFieldOptions(rowId: number, field: string): string[] {
    const snap = service.getSnapshot()
    const row  = snap.allocationList.find(r => r.rowId === rowId)
    if (!row) return []
    return getFieldOptionsFromDomain(field, row, snap.codeLists, row.jobFamily as string | undefined)
  }

  function findVacantPositions(query: { orgCode?: string } = {}): VacantPositionResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    return allocationList
      .filter(r => !r.userId && !!r.positionCode)
      .filter(r => !query.orgCode || r.departmentCode === query.orgCode)
      .map(r => {
        const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)
        return {
          rowId:         r.rowId,
          positionCode:  r.positionCode!,
          orgCode:       r.departmentCode ?? '',
          orgName:       org?.name,
          localJobTitle: r.localJobTitle ?? '',
        }
      })
  }

  function getPersonDetail(userId: string): Array<{
    rowId:          number
    name:           string
    concurrentType?: string
    // Organization
    departmentCode?:     string
    orgName?:            string
    prevDepartmentCode?: string
    prevOrgName?:        string
    // Person fields
    employmentType?:        string
    prevEmploymentType?:    string
    band?:                  string
    prevBand?:              string
    payGrade?:              string
    prevPayGrade?:          string
    leaveOfAbsenceSign?:    string
    // Position fields
    positionCode?:              string
    officialPositionCode?:      string
    prevOfficialPositionCode?:  string
    localJobTitle?:             string
    positionBand?:              string
    managerPositionCode?:       string
    managerName?:               string
    location?:                  string
    costCenter?:                string
    jobFamily?:                 string
    jobType?:                   string
    businessUnit?:              string
    division?:                  string
    subDivision?:               string
    group?:                     string
    team?:                      string
    // Allocation（出向・兼務）
    concurrentReason?:             string
    secondmentFromCompany?:        string
    prevSecondmentFromCompany?:    string
    secondmentToCompany?:          string
    prevSecondmentToCompany?:      string
    secondmentFromEmployeeNumber?: string
    // Transaction meta
    transferReason?:    string
    promotionSign?:     string
    demotionReason?:    string
    payGradeChangeSign?: string
    memo?:              string
  }> {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const rows = allocationList.filter(r => r.userId === userId)
    return rows.map(r => {
      const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)?.name
      const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.prevDepartmentCode)?.name
      return {
        rowId:          r.rowId,
        name:           [r.lastName, r.firstName].filter(Boolean).join(' '),
        concurrentType: r.concurrentType ?? r.prevConcurrentType,
        // Organization
        departmentCode:     r.departmentCode,
        orgName:            orgName ?? r.departmentCode,
        prevDepartmentCode: r.prevDepartmentCode,
        prevOrgName:        prevOrgName ?? r.prevDepartmentCode,
        // Person
        employmentType:     r.employmentType     || r.prevEmploymentType,
        prevEmploymentType: r.prevEmploymentType,
        band:               r.band               || r.prevBand,
        prevBand:           r.prevBand,
        payGrade:           r.payGrade           || r.prevPayGrade,
        prevPayGrade:       r.prevPayGrade,
        leaveOfAbsenceSign: r.leaveOfAbsenceSign,
        // Position
        positionCode:             r.positionCode              || undefined,
        officialPositionCode:     r.officialPositionCode      || r.prevOfficialPositionCode,
        prevOfficialPositionCode: r.prevOfficialPositionCode,
        localJobTitle:            r.localJobTitle             || r.prevLocalJobTitle,
        positionBand:             r.positionBand              || r.prevPositionBand,
        managerPositionCode:      r.managerPositionCode       || undefined,
        managerName:              r.managerName               || undefined,
        location:                 r.location                  || r.prevLocation,
        costCenter:               r.costCenter                || r.prevCostCenter,
        jobFamily:                r.jobFamily                 || r.prevJobFamily,
        jobType:                  r.jobType                   || r.prevJobType,
        businessUnit:             r.businessUnit              || r.prevBusinessUnit,
        division:                 r.division                  || r.prevDivision,
        subDivision:              r.subDivision               || r.prevSubDivision,
        group:                    r.group                     || r.prevGroup,
        team:                     r.team                      || r.prevTeam,
        // Allocation
        concurrentReason:             r.concurrentReason,
        secondmentFromCompany:        r.secondmentFromCompany,
        prevSecondmentFromCompany:    r.prevSecondmentFromCompany,
        secondmentToCompany:          r.secondmentToCompany,
        prevSecondmentToCompany:      r.prevSecondmentToCompany,
        secondmentFromEmployeeNumber: r.secondmentFromEmployeeNumber,
        // Transaction meta
        transferReason:    r.transferReason,
        promotionSign:     r.promotionSign    || undefined,
        demotionReason:    r.demotionReason,
        payGradeChangeSign: r.payGradeChangeSign || undefined,
        memo:              r.memo,
      }
    })
  }

  /**
   * 複数条件で従業員を一括検索し、全フィールドを返す。
   * 1人につき1エントリ（本務行ベース）。
   *
   * @param query.name       氏名（部分一致）
   * @param query.userId     userId（部分一致）
   * @param query.orgCode    所属組織コード（完全一致）
   * @param query.hasChanges true のとき変更ありの人のみ返す
   * @param query.hasErrors  true のとき検証エラーありの人のみ返す
   * @param query.where      フィールド名:値 の追加絞り込み条件（完全一致）
   *                         例: { leaveOfAbsenceSign: '1' }
   */
  function searchPersons(query: {
    name?:       string
    userId?:     string
    orgCode?:    string
    hasChanges?: boolean
    hasErrors?:  boolean
    where?:      Record<string, string>
    limit?:      number
    offset?:     number
  }): { items: PersonDetail[]; totalCount: number; truncated: boolean } {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()

    // group by userId
    const byUserId = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.userId) continue
      const bucket = byUserId.get(row.userId) ?? []
      bucket.push(row)
      byUserId.set(row.userId, bucket)
    }

    const results: PersonDetail[] = []

    for (const [uid, rows] of byUserId) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')

      // ── basic filters ──────────────────────────────────────────────────
      if (query.name    && !name.includes(query.name))              continue
      if (query.userId  && !uid.includes(query.userId))             continue
      if (query.orgCode && primary.departmentCode !== query.orgCode) continue

      // ── where: field-level exact match ────────────────────────────────
      if (query.where) {
        const skip = Object.entries(query.where).some(
          ([field, val]) => (primary as Record<string, unknown>)[field] !== val
        )
        if (skip) continue
      }

      // ── hasChanges ────────────────────────────────────────────────────
      if (query.hasChanges) {
        const changed = rows.some(r => detectChanges(r).diffCount > 0)
        if (!changed) continue
      }

      // ── hasErrors / collect validation ────────────────────────────────
      let errorCount   = 0
      let warningCount = 0
      for (const r of rows) {
        const issues = validateRow({ row: r, afterOrganizations, codeLists, allocationList, changes: detectChanges(r) })
        errorCount   += issues.filter(i => i.level === 'error').length
        warningCount += issues.filter(i => i.level === 'warning').length
      }
      if (query.hasErrors && errorCount === 0) continue

      // ── derive changeKinds from all rows ──────────────────────────────
      const allKinds = new Set<string>()
      for (const r of rows) {
        const { kinds } = detectChanges(r)
        const { active } = deriveEditPatterns(kinds, r, codeLists)
        active.forEach(p => allKinds.add(EDIT_PATTERN_META[p]?.label ?? p))
      }

      const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === primary.departmentCode)?.name
      const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === primary.prevDepartmentCode)?.name

      results.push({
        userId:          uid,
        name,
        primaryRowId:    primary.rowId,
        concurrentRowIds: rows.filter(r => r !== primary).map(r => r.rowId),
        // Organization
        departmentCode:      primary.departmentCode,
        orgName:             orgName ?? primary.departmentCode,
        prevDepartmentCode:  primary.prevDepartmentCode,
        prevOrgName:         prevOrgName ?? primary.prevDepartmentCode,
        businessUnit:        primary.businessUnit  || primary.prevBusinessUnit,
        division:            primary.division      || primary.prevDivision,
        subDivision:         primary.subDivision   || primary.prevSubDivision,
        group:               primary.group         || primary.prevGroup,
        team:                primary.team          || primary.prevTeam,
        // Person
        employmentType:      primary.employmentType     || primary.prevEmploymentType,
        prevEmploymentType:  primary.prevEmploymentType,
        band:                primary.band               || primary.prevBand,
        prevBand:            primary.prevBand,
        payGrade:            primary.payGrade           || primary.prevPayGrade,
        prevPayGrade:        primary.prevPayGrade,
        leaveOfAbsenceSign:  primary.leaveOfAbsenceSign,
        prevLeaveOfAbsenceSign: primary.prevLeaveOfAbsenceSign,
        // Position
        positionCode:             primary.positionCode             || undefined,
        prevPositionCode:         primary.prevPositionCode         || undefined,
        officialPositionCode:     primary.officialPositionCode     || primary.prevOfficialPositionCode,
        prevOfficialPositionCode: primary.prevOfficialPositionCode,
        localJobTitle:            primary.localJobTitle            || primary.prevLocalJobTitle,
        prevLocalJobTitle:        primary.prevLocalJobTitle,
        positionBand:             primary.positionBand             || primary.prevPositionBand,
        managerPositionCode:      primary.managerPositionCode      || undefined,
        managerName:              primary.managerName              || undefined,
        location:                 primary.location                 || primary.prevLocation,
        costCenter:               primary.costCenter               || primary.prevCostCenter,
        jobFamily:                primary.jobFamily                || primary.prevJobFamily,
        jobType:                  primary.jobType                  || primary.prevJobType,
        // Allocation
        concurrentType:               primary.concurrentType,
        concurrentReason:             primary.concurrentReason,
        secondmentFromCompany:        primary.secondmentFromCompany,
        prevSecondmentFromCompany:    primary.prevSecondmentFromCompany,
        secondmentToCompany:          primary.secondmentToCompany,
        prevSecondmentToCompany:      primary.prevSecondmentToCompany,
        secondmentFromEmployeeNumber: primary.secondmentFromEmployeeNumber,
        // Transaction meta
        transferReason:    primary.transferReason,
        promotionSign:     primary.promotionSign     || undefined,
        demotionReason:    primary.demotionReason,
        payGradeChangeSign: primary.payGradeChangeSign || undefined,
        memo:              primary.memo,
        // Derived
        hasChanges:   rows.some(r => detectChanges(r).diffCount > 0),
        changeKinds:  [...allKinds],
        errorCount,
        warningCount,
      })
    }

    const limit  = query.limit  ?? 200
    const offset = query.offset ?? 0
    const page   = results.slice(offset, offset + limit)
    return { items: page, totalCount: results.length, truncated: results.length > offset + limit }
  }

  const CHANGED_ROWS_LIMIT = 100

  function listChangedRows(options: { limit?: number; offset?: number } = {}): {
    items: Array<{
      rowId:    number
      userId:   string | undefined
      name:     string
      orgName:  string
      kinds:    string[]
      grade:    { before: string | undefined; after: string | undefined } | null
      position: { before: string | undefined; after: string | undefined } | null
    }>
    totalCount: number
    truncated:  boolean
  } {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const limit  = options.limit  ?? CHANGED_ROWS_LIMIT
    const offset = options.offset ?? 0

    const changed = allocationList.filter(r => {
      const { diffCount } = detectChanges(r)
      return diffCount > 0
    })

    const page = changed.slice(offset, offset + limit)
    const items = page.map(r => {
      const { kinds } = detectChanges(r)
      const orgName = afterOrganizations.find(
        o => (o.externalCode ?? o.id) === r.departmentCode
      )?.name ?? r.departmentCode ?? ''
      return {
        rowId:    r.rowId,
        userId:   r.userId,
        name:     [r.lastName, r.firstName].filter(Boolean).join(' '),
        orgName,
        kinds:    [...kinds],
        grade:    r.prevPayGrade !== r.payGrade
          ? { before: r.prevPayGrade, after: r.payGrade } : null,
        position: r.prevOfficialPositionCode !== r.officialPositionCode
          ? { before: r.prevOfficialPositionCode, after: r.officialPositionCode } : null,
      }
    })

    return {
      items,
      totalCount: changed.length,
      truncated:  changed.length > offset + limit,
    }
  }

  /** 組織ツリーデータを返す。ChatWidget の組み立ては toolRegistry 側で行う。 */
  function getOrgTreeData(rootOrgCode?: string): {
    ok: true; orgName: string; tree: OrgTreeNode; totalMembers: number
  } | { ok: false; error: string } {
    const { afterOrganizations } = service.getSnapshot()
    const allPersons = findPersons({})

    const rootOrg = rootOrgCode
      ? afterOrganizations.find(o => o.externalCode === rootOrgCode || o.id === rootOrgCode)
      : afterOrganizations.find(o => !o.parentId && !o.isAbandoned)

    if (!rootOrg) return {
      ok: false,
      error: rootOrgCode ? `組織コード "${rootOrgCode}" が見つかりません` : '組織データがありません',
    }

    const tree = buildOrgTree(rootOrg, afterOrganizations, allPersons)

    function countTotal(node: OrgTreeNode): number {
      return node.members.length + node.children.reduce((s, c) => s + countTotal(c), 0)
    }

    return { ok: true, orgName: rootOrg.name, tree, totalMembers: countTotal(tree) }
  }

  return {
    findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons,
    getRowContext, getFieldOptions, findVacantPositions,
    getPersonDetail, searchPersons, listChangedRows, getOrgTreeData,
  }
}
