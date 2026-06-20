import { useMemo } from 'react'
import { useScopedStore } from '../../../store/useScopedStore'
import { validateRow, type ValidationIssue } from '@personnel/domain/validation/validateRow'
import { detectPatterns, type RowChanges, type DetectContext } from '@personnel/domain/patterns/detection'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface ReviewRow {
  row:          AllocationRow
  changes:      RowChanges
  activePatterns: Set<EditPattern>
  issues:       ValidationIssue[]
}

export interface ReviewData {
  rows:        ReviewRow[]
  totalIssues: number
  summary: {
    byPattern:      Map<EditPattern, number>
    bandMismatches: number
    withIssues:     number
  }
}

export function useReviewData(): ReviewData {
  const { allocationList, afterOrganizations, beforeOrganizations, masters, orgMapping } = useScopedStore()

  // 旧組織ID → externalCode
  const beforeCodeById = useMemo(
    () => new Map(beforeOrganizations.filter(o => o.externalCode).map(o => [o.id, o.externalCode!])),
    [beforeOrganizations]
  )
  // 新組織ID → externalCode
  const afterCodeById = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.id, o.externalCode!])),
    [afterOrganizations]
  )

  // "${beforeExternalCode}|${afterExternalCode}" のペア集合
  const sameOrgPairs = useMemo((): Set<string> => {
    const pairs = new Set<string>()
    for (const [beforeId, afterIds] of orgMapping) {
      const beforeCode = beforeCodeById.get(beforeId)
      if (!beforeCode) continue
      for (const afterId of afterIds) {
        const afterCode = afterCodeById.get(afterId)
        if (afterCode) pairs.add(`${beforeCode}|${afterCode}`)
      }
    }
    return pairs
  }, [orgMapping, beforeCodeById, afterCodeById])

  const detectCtx = useMemo((): DetectContext => ({
    allocationList,
    afterOrganizations,
    masters,
    sameOrgPairs,
  }), [allocationList, afterOrganizations, masters, sameOrgPairs])

  const rows = useMemo((): ReviewRow[] =>
    allocationList.map(row => {
      const changes = detectPatterns(row, detectCtx)
      return {
        row,
        changes,
        activePatterns: changes.patterns,
        issues: validateRow({ row, afterOrganizations, masters, allocationList: [], changes }),
      }
    }),
    [allocationList, afterOrganizations, masters, detectCtx]
  )

  const summary = useMemo(() => {
    const byPattern = new Map<EditPattern, number>()
    let bandMismatches = 0, withIssues = 0
    for (const { changes, activePatterns, issues } of rows) {
      for (const p of activePatterns) byPattern.set(p, (byPattern.get(p) ?? 0) + 1)
      if (changes.bandMismatch) bandMismatches++
      if (issues.length > 0)    withIssues++
    }
    return { byPattern, bandMismatches, withIssues }
  }, [rows])

  const totalIssues = useMemo(() => rows.reduce((acc, r) => acc + r.issues.length, 0), [rows])

  return { rows, totalIssues, summary }
}
