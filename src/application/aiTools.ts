// AI tool functions for Claude Tool Use integration.
//
// Design principles:
//   - find* functions are pure read operations — no side effects.
//   - execute/undo go through HRApplicationService.executeOperation(), which
//     enforces validate → checkpoint → apply order.
//   - All arguments and return values are JSON-serializable plain objects
//     so they can be passed as Claude tool_use input/output unchanged.
//   - Testable: createAITools(service) accepts any HRApplicationService,
//     so tests can inject a fresh instance rather than using the singleton.
//
// Usage (production):
//   import { aiTools } from './aiTools'
//   aiTools.findPersons({ name: '田中' })
//
// Usage (test):
//   const svc = new HRApplicationService()
//   svc.loadExcelData(mockData)
//   const tools = createAITools(svc)
//   tools.findPersons({ name: '田中' })

import { appService, HRApplicationService } from './HRApplicationService'
import type { ValidationResult, OperationError, IDomainOperation } from '../domain/operation/types'
import type { AllocationRow }   from '../domain/allocationRow'
import type { Person, Organization } from '../domain/schemas'
import { ChangeTitleOperation, derivePersonGradeFields } from '../domain/operation/handlers/changeTitle'
import { detectChanges } from '../domain/review/changeDetection'
import { validateRow }   from '../domain/validation/validateRow'

export interface VacantPositionResult {
  rowId:         number
  positionCode:  string
  orgCode:       string
  orgName?:      string
  localJobTitle: string
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface PersonSearchResult {
  userId:   string
  name:     string
  orgCode:  string
  orgName?: string
  rowIds:   number[]
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createAITools(service: HRApplicationService) {

  // ── Search tools (read-only) ─────────────────────────────────────────────

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

  // ── Validation tool ──────────────────────────────────────────────────────

  function validateOperation(op: IDomainOperation): ValidationResult {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    return op.validate({ allocationList, afterOrganizations, codeLists })
  }

  // ── Mutation tools ────────────────────────────────────────────────────────

  function executeOperation(op: IDomainOperation): ValidationResult {
    return service.executeOperation(op)
  }

  function undo(): void { service.undo() }

  // ── Position search ───────────────────────────────────────────────────────

  // 空席ポジションを検索する（AIがアサイン先を選ぶために使う）
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

  // ── Position mutations ────────────────────────────────────────────────────
  // これらは HRApplicationService の直接メソッドへの薄いラッパー。
  // ロジックはドメイン側（HRApplicationService）に一元管理されており、AIとUIで共有される。

  // 空席ポジションを新規作成。managerPositionCode を指定するとレポートラインも1操作で設定できる
  function createVacantPosition(departmentCode: string, localJobTitle: string, managerPositionCode?: string): void {
    service.createVacantPosition(departmentCode, localJobTitle, managerPositionCode ? { managerPositionCode } : undefined)
  }

  // 空席ポジションに人を配属（vacantRowId: 空席行のrowId, personUserId: sfPersonId/userId）
  function assignPersonToVacantPosition(vacantRowId: number, personUserId: string): void {
    service.assignPersonToVacantPosition(vacantRowId, personUserId)
  }

  // ポジションから人を外す（ポジションは空席化、人は未アサイン行として保持）
  function unassignPersonFromPosition(rowId: number): void {
    service.unassignPersonFromPosition(rowId)
  }

  // ポジションを削除（在席中の場合は人を未アサイン行に移してからポジション行を削除）
  function removePosition(rowId: number): void {
    service.removePosition(rowId)
  }

  // ── Review tools (read-only) ─────────────────────────────────────────────

  /** 変更サマリーを返す。変更種別ごとの件数と問題件数を含む */
  function getReviewSummary(): {
    totalRows:    number
    changedRows:  number
    byKind:       Record<string, number>
    errorCount:   number
    warningCount: number
  } {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const byKind: Record<string, number> = {}
    let changedRows = 0, errorCount = 0, warningCount = 0
    for (const row of allocationList) {
      const { diffCount, kinds } = detectChanges(row)
      if (diffCount > 0) {
        changedRows++
        for (const k of kinds) byKind[k] = (byKind[k] ?? 0) + 1
      }
      const changes = detectChanges(row)
      for (const issue of validateRow(row, afterOrganizations, codeLists, changes, allocationList)) {
        issue.level === 'error' ? errorCount++ : warningCount++
      }
    }
    return { totalRows: allocationList.length, changedRows, byKind, errorCount, warningCount }
  }

  /** 特定の変更種別を持つ人のリストを返す */
  function getChangedPersons(filter: { kinds?: string[] } = {}): Array<{
    userId:   string
    name:     string
    orgName:  string
    kinds:    string[]
    rowId:    number
  }> {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const results = []
    for (const row of allocationList) {
      if (!row.userId) continue
      const { kinds } = detectChanges(row)
      if (kinds.size === 0) continue
      if (filter.kinds && !filter.kinds.some(k => kinds.has(k as never))) continue
      const org = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
      results.push({
        userId:  row.userId,
        name:    [row.lastName, row.firstName].filter(Boolean).join(' '),
        orgName: org?.name ?? row.departmentCode ?? '',
        kinds:   [...kinds],
        rowId:   row.rowId,
      })
    }
    return results
  }

  /** バリデーション問題を返す。level でフィルタ可能 */
  function getValidationIssues(filter: { level?: 'error' | 'warning' } = {}): Array<{
    rowId:   number
    userId:  string
    name:    string
    field:   string
    level:   string
    message: string
  }> {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const results = []
    for (const row of allocationList) {
      const changes = detectChanges(row)
      const issues = validateRow(row, afterOrganizations, codeLists, changes, allocationList)
      for (const issue of issues) {
        if (filter.level && issue.level !== filter.level) continue
        results.push({
          rowId:   row.rowId,
          userId:  row.userId ?? '',
          name:    [row.lastName, row.firstName].filter(Boolean).join(' '),
          field:   String(issue.field),
          level:   issue.level,
          message: issue.message,
        })
      }
    }
    return results
  }

  // ── Validation diagnosis ─────────────────────────────────────────────────

  /**
   * バリデーション問題を「修正方法」でグループ化して返す。
   * AI はこれを呼んでから propose_bulk_set_field や propose_re_derive_* を呼ぶ。
   */
  function getValidationDiagnosis(): {
    summary: { errors: number; warnings: number }
    byField: Array<{
      field:           string
      level:           'error' | 'warning'
      count:           number
      rowIds:          number[]
      suggestedTool?:  string
      suggestedAction?: string
    }>
  } {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    type Entry = { level: 'error' | 'warning'; rowIds: Set<number> }
    const fieldMap = new Map<string, Entry>()

    for (const row of allocationList) {
      const changes = detectChanges(row)
      for (const issue of validateRow(row, afterOrganizations, codeLists, changes, allocationList)) {
        const key = String(issue.field)
        const existing = fieldMap.get(key)
        if (existing) {
          existing.rowIds.add(row.rowId)
          if (issue.level === 'error') existing.level = 'error'
        } else {
          fieldMap.set(key, { level: issue.level, rowIds: new Set([row.rowId]) })
        }
      }
    }

    // フィールドごとにどのツールで修正できるかを付与
    const FIELD_TOOL: Record<string, { tool: string; action: string }> = {
      transferReason:       { tool: 'propose_bulk_set_field', action: '異動事由を一括設定できます' },
      concurrentReason:     { tool: 'propose_bulk_set_field', action: '兼務理由を一括設定できます' },
      managerPositionCode:  { tool: 'propose_bulk_set_field', action: 'propose_set_manager_position で個別修正 または propose_bulk_set_field で一括クリアできます' },
      demotionReason:       { tool: 'propose_bulk_set_field', action: '降格事由を一括設定できます' },
      secondmentFromCompany:       { tool: 'propose_bulk_set_field', action: '出向元会社を一括設定できます' },
      secondmentFromEmployeeNumber: { tool: 'propose_bulk_set_field', action: '出向元社員番号を一括設定できます' },
    }

    let errors = 0, warnings = 0
    const byField = Array.from(fieldMap.entries())
      .map(([field, { level, rowIds }]) => {
        const rowIdsArr = [...rowIds]
        level === 'error' ? (errors += rowIdsArr.length) : (warnings += rowIdsArr.length)
        const hint = FIELD_TOOL[field]
        return {
          field,
          level,
          count:           rowIdsArr.length,
          rowIds:          rowIdsArr,
          suggestedTool:   hint?.tool,
          suggestedAction: hint?.action,
        }
      })
      .sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1) || b.count - a.count)

    return { summary: { errors, warnings }, byField }
  }

  // ── Position code assignment ─────────────────────────────────────────────

  /**
   * 内部採番コード（_pos_…）のポジション一覧を返す。
   * propose_assign_position_codes と組み合わせてコードを割り当てるために使う。
   */
  function getUnassignedPositions(): Array<{
    rowId:          number
    positionCode:   string
    localJobTitle:  string
    departmentCode: string
    orgName:        string
  }> {
    return service.getUnassignedPositions()
  }

  // ── 役職変更 ─────────────────────────────────────────────────────────────

  /**
   * 役職を変更する。新しい内部ポジションコードを採番し、旧ポジションを空席化、部下の上司コードも追従させる。
   * rowId: 対象行の rowId（allocationList の行。人が在席している行を指定）
   * suggestOnly: true を指定すると操作せず推奨値のみ返す（codeLists 未整備のため現在は空を返す）
   */
  function changeTitle(params: {
    rowId:                number
    officialPositionCode: string
    localJobTitle:        string
    positionBand:         string
    band:                 string
    payGrade:             string
  }): ValidationResult {
    const ctx = service.getSnapshot()
    const suggested = derivePersonGradeFields(params.officialPositionCode, ctx)
    return service.executeOperation(
      new ChangeTitleOperation(
        params.rowId,
        params.officialPositionCode,
        params.localJobTitle,
        params.positionBand || suggested.positionBand || '',
        params.band         || suggested.band         || '',
        params.payGrade     || suggested.payGrade     || '',
      )
    )
  }

  /**
   * officialPositionCode から推奨バンド・給与等級を返す。
   * codeLists に役職→バンド変換が追加されたら値が埋まる。現時点では空を返す。
   */
  function suggestTitleFields(officialPositionCode: string): {
    positionBand?: string; band?: string; payGrade?: string
  } {
    return derivePersonGradeFields(officialPositionCode, service.getSnapshot())
  }

  // ── Manager position ─────────────────────────────────────────────────────

  /**
   * 上司ポジションコードを設定し、managerName も自動入力する。
   * saveRow で直接 managerPositionCode を変更すると managerName が更新されないため、
   * AI はこのツールを使うこと。
   */
  function setManagerPosition(rowId: number, managerPositionCode: string): ValidationResult {
    const { allocationList } = service.getSnapshot()
    const mgrRow  = allocationList.find(r => r.positionCode === managerPositionCode)
    const managerName = mgrRow
      ? [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ')
      : ''
    return service.saveRow(rowId, { managerPositionCode, managerName })
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  function formatErrors(errors: OperationError[]): string {
    return errors.map(e => e.field ? `[${e.field}] ${e.message}` : e.message).join('\n')
  }

  return {
    findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons,
    findVacantPositions,
    validateOperation, executeOperation, undo,
    createVacantPosition, assignPersonToVacantPosition, unassignPersonFromPosition, removePosition,
    changeTitle, suggestTitleFields,
    setManagerPosition,
    reDeriveManagerNames: () => service.reDeriveManagerNames(),
    reDeriveOrgSubFields: () => service.reDeriveOrgSubFields(),
    getUnassignedPositions,
    assignPositionCodes: (assignments: import('../ports').PositionCodeAssignment[]) =>
      service.assignPositionCodes(assignments),
    getReviewSummary, getChangedPersons, getValidationIssues, getValidationDiagnosis,
    formatErrors,
  }
}

// ── Default instance (production) ────────────────────────────────────────────
export const aiTools = createAITools(appService)
