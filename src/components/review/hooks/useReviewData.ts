import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { validateRow, type ValidationIssue } from '../../../domain/validation/validateRow'
import { detectChanges, type RowChanges } from '../../../domain/review/changeDetection'
import { buildOrgMatchIndex, type OrgMatch } from '../../../domain/review/orgMatching'
import type { AllocationRow } from '../../../domain/allocationRow'

export interface ReviewRow {
  row:     AllocationRow
  changes: RowChanges
  issues:  ValidationIssue[]
}

export interface ReviewData {
  rows:       ReviewRow[]
  orgMatches: Map<string, OrgMatch>
  totalIssues: number
  summary: {
    transfers:    number
    promotions:   number
    demotions:    number
    titleChanges: number
    newHires:     number
    terminations: number
    bandMismatches: number
    withIssues:   number
  }
}

export function useReviewData(): ReviewData {
  const { allocationList, afterOrganizations, beforeOrganizations, codeLists } = useStore()

  const rows = useMemo((): ReviewRow[] =>
    allocationList.map(row => ({
      row,
      changes: detectChanges(row),
      issues:  validateRow(row, afterOrganizations, codeLists),
    })),
    [allocationList, afterOrganizations, codeLists]
  )

  const orgMatches = useMemo(
    () => buildOrgMatchIndex(allocationList, beforeOrganizations, afterOrganizations),
    [allocationList, beforeOrganizations, afterOrganizations]
  )

  const summary = useMemo(() => {
    let transfers = 0, promotions = 0, demotions = 0, titleChanges = 0
    let newHires = 0, terminations = 0, bandMismatches = 0, withIssues = 0
    for (const { changes, issues } of rows) {
      if (changes.kinds.has('transfer'))    transfers++
      if (changes.kinds.has('promotion'))   promotions++
      if (changes.kinds.has('demotion'))    demotions++
      if (changes.kinds.has('titleChange')) titleChanges++
      if (changes.kinds.has('newHire'))     newHires++
      if (changes.kinds.has('termination')) terminations++
      if (changes.bandMismatch)             bandMismatches++
      if (issues.length > 0)                withIssues++
    }
    return { transfers, promotions, demotions, titleChanges, newHires, terminations, bandMismatches, withIssues }
  }, [rows])

  const totalIssues = useMemo(() => rows.reduce((acc, r) => acc + r.issues.length, 0), [rows])

  return { rows, orgMatches, totalIssues, summary }
}
