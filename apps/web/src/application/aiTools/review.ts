import type { HRApplicationService } from '../HRApplicationService'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import type { EditPattern } from '@personnel/domain/patterns/editPatterns'
import { validateRow } from '@personnel/domain/validation/validateRow'

export function createReviewMethods(service: HRApplicationService) {

  function getReviewSummary(): {
    totalRows:    number
    changedRows:  number
    byKind:       Record<string, number>
    errorCount:   number
    warningCount: number
  } {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    const byKind: Record<string, number> = {}
    let changedRows = 0, errorCount = 0, warningCount = 0
    for (const row of allocationList) {
      const changes = detectPatterns(row, ctx)
      if (changes.diffCount > 0) {
        changedRows++
        for (const k of changes.patterns) byKind[k] = (byKind[k] ?? 0) + 1
      }
      for (const issue of validateRow({ row, afterOrganizations, codeLists, allocationList, changes })) {
        issue.level === 'error' ? errorCount++ : warningCount++
      }
    }
    return { totalRows: allocationList.length, changedRows, byKind, errorCount, warningCount }
  }

  function getChangedPersons(filter: { kinds?: string[] } = {}): Array<{
    userId:  string
    name:    string
    orgName: string
    kinds:   string[]
    rowId:   number
  }> {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    const results = []
    for (const row of allocationList) {
      if (!row.userId) continue
      const { patterns } = detectPatterns(row, ctx)
      if (patterns.size === 0) continue
      if (filter.kinds && !filter.kinds.some(k => patterns.has(k as EditPattern))) continue
      const org = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
      results.push({
        userId:  row.userId,
        name:    [row.lastName, row.firstName].filter(Boolean).join(' '),
        orgName: org?.name ?? row.departmentCode ?? '',
        kinds:   [...patterns],
        rowId:   row.rowId,
      })
    }
    return results
  }

  function getValidationIssues(filter: { level?: 'error' | 'warning' } = {}): Array<{
    rowId:   number
    userId:  string
    name:    string
    field:   string
    level:   string
    message: string
  }> {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    const results = []
    for (const row of allocationList) {
      const changes = detectPatterns(row, ctx)
      const issues = validateRow({ row, afterOrganizations, codeLists, allocationList, changes })
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
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, codeLists }
    type Entry = { level: 'error' | 'warning'; rowIds: Set<number> }
    const fieldMap = new Map<string, Entry>()

    for (const row of allocationList) {
      const changes = detectPatterns(row, ctx)
      for (const issue of validateRow({ row, afterOrganizations, codeLists, allocationList, changes })) {
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

  return { getReviewSummary, getChangedPersons, getValidationIssues, getValidationDiagnosis }
}
