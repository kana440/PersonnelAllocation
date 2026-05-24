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
      for (const issue of validateRow(row, afterOrganizations, codeLists)) {
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
      const issues = validateRow(row, afterOrganizations, codeLists)
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

  // ── Utility ──────────────────────────────────────────────────────────────

  function formatErrors(errors: OperationError[]): string {
    return errors.map(e => e.field ? `[${e.field}] ${e.message}` : e.message).join('\n')
  }

  return {
    findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons,
    findVacantPositions,
    validateOperation, executeOperation, undo,
    createVacantPosition, assignPersonToVacantPosition, unassignPersonFromPosition, removePosition,
    getReviewSummary, getChangedPersons, getValidationIssues,
    formatErrors,
  }
}

// ── Default instance (production) ────────────────────────────────────────────
export const aiTools = createAITools(appService)
