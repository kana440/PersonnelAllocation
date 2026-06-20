import type { HRApplicationService } from '../HRApplicationService'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person, Organization } from '@personnel/domain/schemas'
import { buildFlatOrgView } from '@personnel/domain/choices/orgTree'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import { EDIT_PATTERN_META } from '@personnel/domain/patterns/editPatterns'
import { ALL_EDIT_OPERATIONS, ALL_MULTI_ROW_OPERATION_DEFS } from '@personnel/domain/commands/defs'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { getFieldOptions as getFieldOptionsFromDomain } from '@personnel/domain/choices'
import { computeBandStepDiff, getBandsByStep } from '@personnel/domain/derivation'
import type { OrgTreeNode, SelectedRowContext } from '../aiTypes'
import type {
  PersonSearchResult, PersonResult, PersonRowDetail, VacantPositionResult,
} from './types'
import { buildOrgTree } from './orgTree'

export function createReadMethods(service: HRApplicationService) {

  /**
   * 従業員を検索し、各人のポジション情報（現在 + 変更前）を返す。
   *
   * 明示的パラメータ（name / userId / groupEmployeeId / employeeNumber）は部分一致。
   * それ以外のフィールドは filter に AllocationRow のフィールド名をそのまま指定する
   * （例: { departmentCode: 'D001' } / { prevDepartmentCode: 'D001' } / { concurrentType: '兼務' }）。
   * 兼務行も含む。userId なし（新規メンバー等）も対象。
   */
  function findPersons(query: {
    name?:            string
    userId?:          string
    groupEmployeeId?: string
    employeeNumber?:  string
    subtreeOrgCode?:  string   // この org 以下のメンバーを取得（配下の組織も含む）
    filter?:          Record<string, string>
  }): PersonResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()

    // subtreeOrgCode が指定された場合、配下 org の orgCode セットを構築
    let subtreeCodes: Set<string> | null = null
    if (query.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === query.subtreeOrgCode)
      if (root) {
        subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
      }
    }

    // Group rows by person key
    const byKey = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      // Skip truly vacant positions (position slot with no person identity at all)
      const hasName = row.lastName || row.firstName
      if (!row.userId && !row.groupEmployeeId && !row.employeeNumber && !hasName) continue

      const key = row.userId
        ? `uid:${row.userId}`
        : row.groupEmployeeId
        ? `gid:${row.groupEmployeeId}`
        : row.employeeNumber
        ? `emp:${row.employeeNumber}`
        : `row:${row.rowId}`

      const bucket = byKey.get(key) ?? []
      bucket.push(row)
      byKey.set(key, bucket)
    }

    const results: PersonResult[] = []

    for (const [, rows] of byKey) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')

      // Identity filters (partial match)
      if (query.name           && !name.includes(query.name))                                    continue
      if (query.userId         && !(primary.userId         ?? '').includes(query.userId))         continue
      if (query.groupEmployeeId && !(primary.groupEmployeeId ?? '').includes(query.groupEmployeeId)) continue
      if (query.employeeNumber  && !(primary.employeeNumber  ?? '').includes(query.employeeNumber))  continue

      // Subtree filter: primary row の departmentCode が対象サブツリーに含まれるか
      if (subtreeCodes && !subtreeCodes.has(primary.departmentCode ?? '')) continue

      // Arbitrary field filter (exact match on primary row)
      if (query.filter) {
        const skip = Object.entries(query.filter).some(
          ([field, val]) => String((primary as Record<string, unknown>)[field] ?? '') !== val
        )
        if (skip) continue
      }

      const positions = rows.map(r => {
        const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)?.name
        const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.prevDepartmentCode)?.name
        return {
          rowId:                  r.rowId,
          departmentCode:         r.departmentCode,
          orgName,
          positionCode:           r.positionCode           || undefined,
          localJobTitle:          r.localJobTitle          || undefined,
          concurrentType:         r.concurrentType,
          secondmentToCompany:    r.secondmentToCompany    || undefined,
          secondmentFromCompany:  r.secondmentFromCompany  || undefined,
          prevDepartmentCode:     r.prevDepartmentCode,
          prevOrgName,
          prevPositionCode:       r.prevPositionCode       || undefined,
          prevLocalJobTitle:      r.prevLocalJobTitle      || undefined,
          prevConcurrentType:     r.prevConcurrentType,
          prevSecondmentToCompany:   r.prevSecondmentToCompany   || undefined,
          prevSecondmentFromCompany: r.prevSecondmentFromCompany || undefined,
        }
      })

      results.push({
        userId:          primary.userId,
        groupEmployeeId: primary.groupEmployeeId,
        employeeNumber:  primary.employeeNumber,
        name,
        positions,
      })
    }

    return results
  }

  function findOrgs(query: { name?: string; code?: string; level?: number; company?: string }): Array<{
    orgCode:            string
    orgName:            string
    level:              number
    parentOrgCode?:     string
    path:               string[]
    descendantOrgCodes: string[]
  }> {
    const { afterOrganizations } = service.getSnapshot()
    const view = buildFlatOrgView(afterOrganizations)
    return view
      .filter(e => !query.name    || e.orgName.includes(query.name))
      .filter(e => !query.code    || e.orgCode.includes(query.code))
      .filter(e => query.level == null || e.level === query.level)
      .filter(e => !query.company || e.companyId === query.company)
      .map(e => ({
        orgCode:            e.orgCode,
        orgName:            e.orgName,
        level:              e.level,
        parentOrgCode:      e.parentOrgCode,
        path:               e.path,
        descendantOrgCodes: e.descendantCodes,
      }))
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
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    const changes = detectPatterns(row, ctx)
    const issues  = validateRow({ row, afterOrganizations, codeLists, allocationList, changes })

    const changeKinds = [...changes.patterns].map(p => EDIT_PATTERN_META[p]?.label ?? p)

    const availableOps = ALL_EDIT_OPERATIONS
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
        employmentType:       row.employmentType       as string | undefined,
        band:                 row.band                 as string | undefined,
        payGrade:             row.payGrade             as string | undefined,
        officialPositionCode: row.officialPositionCode as string | undefined,
        leaveOfAbsenceSign:   row.leaveOfAbsenceSign   as string | undefined,
        concurrentType:       row.concurrentType       as string | undefined,
        positionCode:         row.positionCode         as string | undefined,
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

  function findVacantPositions(query: { orgCode?: string; subtreeOrgCode?: string } = {}): VacantPositionResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()

    let subtreeCodes: Set<string> | null = null
    if (query.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === query.subtreeOrgCode)
      if (root) subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
    }

    return allocationList
      .filter(r => !r.userId && !!r.positionCode)
      .filter(r => {
        if (subtreeCodes)         return subtreeCodes.has(r.departmentCode ?? '')
        if (query.orgCode)        return r.departmentCode === query.orgCode
        return true
      })
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

  /**
   * 指定した rowId[] の詳細情報を全フィールド取得する。
   * findPersons で取得した positions[].rowId を渡す。
   * before（発令前）と after（発令後）を含む。
   */
  function getPersonsDetail(rowIds: number[]): PersonRowDetail[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    return rowIds
      .map(rowId => allocationList.find(r => r.rowId === rowId))
      .filter((r): r is AllocationRow => r !== undefined)
      .map(r => {
        const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)?.name
        const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.prevDepartmentCode)?.name
        return {
          rowId:          r.rowId,
          name:           [r.lastName, r.firstName].filter(Boolean).join(' '),
          userId:         r.userId,
          groupEmployeeId: r.groupEmployeeId,
          employeeNumber: r.employeeNumber,
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
          prevPositionCode:         r.prevPositionCode          || undefined,
          officialPositionCode:     r.officialPositionCode      || r.prevOfficialPositionCode,
          prevOfficialPositionCode: r.prevOfficialPositionCode,
          localJobTitle:            r.localJobTitle             || r.prevLocalJobTitle,
          prevLocalJobTitle:        r.prevLocalJobTitle,
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
          transferReason:     r.transferReason,
          promotionSign:      r.promotionSign      || undefined,
          demotionReason:     r.demotionReason,
          payGradeChangeSign: r.payGradeChangeSign || undefined,
          memo:               r.memo,
        }
      })
  }

  const CHANGED_ROWS_LIMIT = 100

  function listChangedRows(options: { limit?: number; offset?: number } = {}): {
    items: Array<{
      rowId:            number
      userId?:          string
      groupEmployeeId?: string
      employeeNumber?:  string
      lastName?:        string
      firstName?:       string
      name:             string
      orgName:          string
      kinds:            Array<{ code: string; label: string }>
      grade:    { before: string | undefined; after: string | undefined } | null
      position: { before: string | undefined; after: string | undefined } | null
    }>
    totalCount: number
    truncated:  boolean
  } {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    const limit  = options.limit  ?? CHANGED_ROWS_LIMIT
    const offset = options.offset ?? 0

    const changed = allocationList.filter(r => {
      const { diffCount } = detectPatterns(r, ctx)
      return diffCount > 0
    })

    const page = changed.slice(offset, offset + limit)
    const items = page.map(r => {
      const { patterns } = detectPatterns(r, ctx)
      const orgName = afterOrganizations.find(
        o => (o.externalCode ?? o.id) === r.departmentCode
      )?.name ?? r.departmentCode ?? ''
      return {
        rowId:           r.rowId,
        userId:          r.userId,
        groupEmployeeId: r.groupEmployeeId,
        employeeNumber:  r.employeeNumber,
        lastName:        r.lastName  || undefined,
        firstName:       r.firstName || undefined,
        name:            [r.lastName, r.firstName].filter(Boolean).join(' '),
        orgName,
        kinds:           [...patterns].map(p => ({ code: p, label: EDIT_PATTERN_META[p]?.label ?? p })),
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
    const { allocationList, afterOrganizations } = service.getSnapshot()

    // Build a minimal person list (userId ありのみ) for buildOrgTree
    const byUserId = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.userId) continue
      const bucket = byUserId.get(row.userId) ?? []
      bucket.push(row)
      byUserId.set(row.userId, bucket)
    }
    const allPersons: PersonSearchResult[] = []
    for (const [userId, rows] of byUserId) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      const org     = afterOrganizations.find(o => (o.externalCode ?? o.id) === primary.departmentCode)
      allPersons.push({ userId, name, orgCode: primary.departmentCode ?? '', orgName: org?.name, rowIds: rows.map(r => r.rowId) })
    }

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

  /**
   * 指定行のポジションバンドを基準に、昇格/降格の候補バンドと現在のステップ差を返す。
   * AI が「1段上を提案する」「2段以上は確認する」判断に使う。
   */
  function getPromotionBandInfo(rowId: number): {
    currentPositionBand: string | undefined
    oneLevelUp:   string[]
    twoLevelsUp:  string[]
    oneLevelDown: string[]
    stepDiffFn: undefined
  } | { ok: false; error: string } {
    const { allocationList, codeLists } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, error: '行が見つかりません' }
    const currentPositionBand = row.positionBand as string | undefined
    return {
      currentPositionBand,
      oneLevelUp:   getBandsByStep(currentPositionBand, 1, 'up',   codeLists),
      twoLevelsUp:  getBandsByStep(currentPositionBand, 2, 'up',   codeLists).filter(b => !getBandsByStep(currentPositionBand, 1, 'up', codeLists).includes(b)),
      oneLevelDown: getBandsByStep(currentPositionBand, 1, 'down', codeLists),
      stepDiffFn:   undefined,
    }
  }

  /**
   * 指定行の現在バンドと新バンド間のステップ差を返す。
   * propose_promotion 前の確認に使う（2以上なら大きな昇格）。
   */
  function computePromotionStepDiff(rowId: number, newPositionBand: string): number | undefined | { ok: false; error: string } {
    const { allocationList, codeLists } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, error: '行が見つかりません' }
    return computeBandStepDiff(row.positionBand as string | undefined, newPositionBand, codeLists)
  }

  function getAvailableMultiRowOperations(anchorRowId: number) {
    const { allocationList, codeLists } = service.getSnapshot()
    const anchor = allocationList.find(r => r.rowId === anchorRowId)
    if (!anchor) return []
    return ALL_MULTI_ROW_OPERATION_DEFS
      .filter(d => d.availableFor(anchor, codeLists, allocationList))
      .map(d => ({
        id:          d.id,
        label:       d.label,
        description: d.description,
        sections: d.sections.map(s => ({
          label:    s.label,
          style:    s.style,
          isNewRow: s.isNewRow,
          inputs: s.inputs.map(i => ({
            field:    i.field as string,
            required: i.required,
            label:    i.label,
            picker:   i.picker,
          })),
        })),
      }))
  }

  return {
    findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons,
    getRowContext, getFieldOptions, findVacantPositions,
    getPersonsDetail, listChangedRows, getOrgTreeData,
    getPromotionBandInfo, computePromotionStepDiff,
    getAvailableMultiRowOperations,
  }
}
