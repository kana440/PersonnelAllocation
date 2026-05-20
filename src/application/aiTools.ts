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

  // ── Utility ──────────────────────────────────────────────────────────────

  function formatErrors(errors: OperationError[]): string {
    return errors.map(e => e.field ? `[${e.field}] ${e.message}` : e.message).join('\n')
  }

  return { findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons, validateOperation, executeOperation, undo, formatErrors }
}

// ── Default instance (production) ────────────────────────────────────────────
export const aiTools = createAITools(appService)
