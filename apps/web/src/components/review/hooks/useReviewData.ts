import { useMemo } from 'react'
import { useScopedStore } from '../../../store/useScopedStore'
import { validateRow, type ValidationIssue } from '@personnel/domain/validation/validateRow'
import { detectChanges, type RowChanges } from '@personnel/domain/patterns/changeDetection'
import { deriveEditPatterns, type EditPattern } from '@personnel/domain/patterns/editPattern'
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
    byPattern:    Map<EditPattern, number>
    newHires:     number
    terminations: number
    bandMismatches: number
    withIssues:   number
  }
}

export function useReviewData(): ReviewData {
  const { allocationList, afterOrganizations, beforeOrganizations, codeLists, orgMapping } = useScopedStore()

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

  // positionBand code → promotionDemotionWarningLevel（昇降格ワーニング用チェック）
  const jobLevelWarningMap = useMemo(
    () => new Map((codeLists?.jobLevels ?? []).map(e => [e.code, e.promotionDemotionWarningLevel])),
    [codeLists]
  )

  const rows = useMemo((): ReviewRow[] =>
    allocationList.map(row => {
      const changes = detectChanges(row, sameOrgPairs, jobLevelWarningMap)
      const { active } = deriveEditPatterns(changes.kinds, row, codeLists)
      return {
        row,
        changes,
        activePatterns: new Set(active),
        issues: validateRow({ row, afterOrganizations, codeLists, allocationList: [], changes }),
      }
    }),
    [allocationList, afterOrganizations, codeLists, sameOrgPairs, jobLevelWarningMap]
  )

  const summary = useMemo(() => {
    const byPattern = new Map<EditPattern, number>()
    let newHires = 0, terminations = 0, bandMismatches = 0, withIssues = 0
    for (const { changes, activePatterns, issues } of rows) {
      for (const p of activePatterns) byPattern.set(p, (byPattern.get(p) ?? 0) + 1)
      if (changes.kinds.has('newHire'))     newHires++
      if (changes.kinds.has('termination')) terminations++
      if (changes.bandMismatch)             bandMismatches++
      if (issues.length > 0)                withIssues++
    }
    return { byPattern, newHires, terminations, bandMismatches, withIssues }
  }, [rows])

  const totalIssues = useMemo(() => rows.reduce((acc, r) => acc + r.issues.length, 0), [rows])

  return { rows, totalIssues, summary }
}
