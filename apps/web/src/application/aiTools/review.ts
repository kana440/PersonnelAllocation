import type { HRApplicationService } from '../HRApplicationService'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import type { EditPattern } from '@personnel/domain/patterns/editPatterns'
import { EDIT_PATTERN_META } from '@personnel/domain/patterns/editPatterns'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { buildFlatOrgView } from '@personnel/domain/choices/orgTree'

export function createReviewMethods(service: HRApplicationService) {

  function getReviewSummary(): {
    totalRows:    number
    changedRows:  number
    byKind:       Array<{ code: string; label: string; count: number }>
    errorCount:   number
    warningCount: number
  } {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, masters }
    const kindCount: Record<string, number> = {}
    let changedRows = 0, errorCount = 0, warningCount = 0
    for (const row of allocationList) {
      const changes = detectPatterns(row, ctx)
      if (changes.diffCount > 0) {
        changedRows++
        for (const k of changes.patterns) kindCount[k] = (kindCount[k] ?? 0) + 1
      }
      for (const issue of validateRow({ row, afterOrganizations, masters, allocationList, changes })) {
        issue.level === 'error' ? errorCount++ : warningCount++
      }
    }
    const byKind = Object.entries(kindCount)
      .map(([code, count]) => ({ code, label: EDIT_PATTERN_META[code as keyof typeof EDIT_PATTERN_META]?.label ?? code, count }))
      .sort((a, b) => b.count - a.count)
    return { totalRows: allocationList.length, changedRows, byKind, errorCount, warningCount }
  }

  function getChangedRows(filter: {
    kinds?:           string[]
    name?:            string
    userId?:          string
    groupEmployeeId?: string
    employeeNumber?:  string
    subtreeOrgCode?:  string
    rowFilter?:       Record<string, string>
    limit?:           number
    offset?:          number
  } = {}): {
    items: Array<{
      rowId:               number
      userId?:             string
      groupEmployeeId?:    string
      employeeNumber?:     string
      lastName?:           string
      firstName?:          string
      name:                string
      departmentCode?:     string
      orgName?:            string
      prevDepartmentCode?: string
      prevOrgName?:        string
      kinds:               Array<{ code: string; label: string }>
      grade:    { before: string | undefined; after: string | undefined } | null
      position: { before: string | undefined; after: string | undefined } | null
    }>
    totalCount: number
    truncated:  boolean
  } {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, masters }

    let subtreeCodes: Set<string> | null = null
    if (filter.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === filter.subtreeOrgCode)
      if (root) subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
    }

    const matched = []
    for (const row of allocationList) {
      const hasName = row.lastName || row.firstName
      if (!row.userId && !hasName) continue

      const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
      if (filter.name            && !name.includes(filter.name))                                    continue
      if (filter.userId          && !(row.userId          ?? '').includes(filter.userId))           continue
      if (filter.groupEmployeeId && !(row.groupEmployeeId ?? '').includes(filter.groupEmployeeId)) continue
      if (filter.employeeNumber  && !(row.employeeNumber  ?? '').includes(filter.employeeNumber))  continue
      if (subtreeCodes           && !subtreeCodes.has(row.departmentCode ?? ''))                   continue
      if (filter.rowFilter) {
        const skip = Object.entries(filter.rowFilter).some(
          ([field, val]) => String((row as Record<string, unknown>)[field] ?? '') !== val
        )
        if (skip) continue
      }

      const { patterns } = detectPatterns(row, ctx)
      if (patterns.size === 0) continue
      if (filter.kinds && !filter.kinds.some(k => patterns.has(k as EditPattern))) continue

      const org     = afterOrganizations.find(o => (o.externalCode ?? o.id) === row.departmentCode)
      const prevOrg = afterOrganizations.find(o => (o.externalCode ?? o.id) === row.prevDepartmentCode)
      matched.push({
        rowId:               row.rowId,
        userId:              row.userId,
        groupEmployeeId:     row.groupEmployeeId,
        employeeNumber:      row.employeeNumber,
        lastName:            row.lastName  || undefined,
        firstName:           row.firstName || undefined,
        name,
        departmentCode:      row.departmentCode,
        orgName:             org?.name,
        prevDepartmentCode:  row.prevDepartmentCode,
        prevOrgName:         prevOrg?.name,
        kinds:               [...patterns].map(p => ({ code: p, label: EDIT_PATTERN_META[p]?.label ?? p })),
        grade:    row.prevPayGrade !== row.payGrade
          ? { before: row.prevPayGrade, after: row.payGrade } : null,
        position: row.prevOfficialPositionCode !== row.officialPositionCode
          ? { before: row.prevOfficialPositionCode, after: row.officialPositionCode } : null,
      })
    }

    const totalCount = matched.length
    const offset     = filter.offset ?? 0
    const items      = filter.limit != null
      ? matched.slice(offset, offset + filter.limit)
      : matched.slice(offset)
    return { items, totalCount, truncated: items.length < totalCount - offset }
  }

  function getValidationIssues(filter: {
    level?:           'error' | 'warning'
    name?:            string
    userId?:          string
    groupEmployeeId?: string
    employeeNumber?:  string
    subtreeOrgCode?:  string
    rowFilter?:       Record<string, string>
  } = {}): Array<{
    rowId:            number
    userId?:          string
    groupEmployeeId?: string
    employeeNumber?:  string
    lastName?:        string
    firstName?:       string
    name:             string
    field:            string
    level:            string
    message:          string
    currentValue?:    string
  }> {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, masters }

    let subtreeCodes: Set<string> | null = null
    if (filter.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === filter.subtreeOrgCode)
      if (root) subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
    }

    const results = []
    for (const row of allocationList) {
      // Person / org filters (same logic as findPersons)
      const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
      if (filter.name           && !name.includes(filter.name))                                          continue
      if (filter.userId         && !(row.userId         ?? '').includes(filter.userId))                  continue
      if (filter.groupEmployeeId && !(row.groupEmployeeId ?? '').includes(filter.groupEmployeeId))       continue
      if (filter.employeeNumber  && !(row.employeeNumber  ?? '').includes(filter.employeeNumber))        continue
      if (subtreeCodes           && !subtreeCodes.has(row.departmentCode ?? ''))                        continue
      if (filter.rowFilter) {
        const skip = Object.entries(filter.rowFilter).some(
          ([field, val]) => String((row as Record<string, unknown>)[field] ?? '') !== val
        )
        if (skip) continue
      }

      const changes = detectPatterns(row, ctx)
      const issues  = validateRow({ row, afterOrganizations, masters, allocationList, changes })
      for (const issue of issues) {
        if (filter.level && issue.level !== filter.level) continue
        const field  = String(issue.field)
        const rawVal = (row as Record<string, unknown>)[field]
        results.push({
          rowId:           row.rowId,
          userId:          row.userId,
          groupEmployeeId: row.groupEmployeeId,
          employeeNumber:  row.employeeNumber,
          lastName:        row.lastName  || undefined,
          firstName:       row.firstName || undefined,
          name,
          field,
          level:           issue.level,
          message:         issue.message,
          currentValue:    rawVal != null ? String(rawVal) : undefined,
        })
      }
    }
    return results
  }

  /**
   * バリデーション問題を「修正方法」でグループ化して返す。
   * AI はこれを呼んでから propose_bulk_set_field や propose_re_derive_* を呼ぶ。
   */
  function getValidationDiagnosis(): {
    summary: { errors: number; warnings: number }
    byField: Array<{
      field:            string
      level:            'error' | 'warning'
      count:            number
      rowIds:           number[]
      suggestedTool?:   string
      suggestedAction?: string
    }>
  } {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, masters }
    type Entry = { level: 'error' | 'warning'; rowIds: Set<number> }
    const fieldMap = new Map<string, Entry>()

    for (const row of allocationList) {
      const changes = detectPatterns(row, ctx)
      for (const issue of validateRow({ row, afterOrganizations, masters, allocationList, changes })) {
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

    const FIELD_TOOL: Record<string, { tool: string; action: string }> = {
      transferReason:               { tool: 'propose_bulk_set_field', action: '異動事由を一括設定できます' },
      concurrentReason:             { tool: 'propose_bulk_set_field', action: '兼務理由を一括設定できます' },
      managerPositionCode:          { tool: 'propose_bulk_set_field', action: 'propose_set_manager_position で個別修正 または propose_bulk_set_field で一括クリアできます' },
      demotionReason:               { tool: 'propose_bulk_set_field', action: '降格事由を一括設定できます' },
      secondmentFromCompany:        { tool: 'propose_bulk_set_field', action: '出向元会社を一括設定できます' },
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

  return { getReviewSummary, getChangedRows, getValidationIssues, getValidationDiagnosis }
}
