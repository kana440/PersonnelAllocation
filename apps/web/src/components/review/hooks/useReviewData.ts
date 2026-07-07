import { useMemo } from 'react'
import { useScopedStore } from '../../../store/useScopedStore'
import { validateRow, type ValidationIssue } from '@personnel/domain/rules/validate/validateRow'
import { detectPatterns, type RowChanges, type DetectContext } from '@personnel/domain/patterns/detection'
import { RowRuleCtx } from '@personnel/domain/rules/rowRule'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface ReviewRow {
  row:            AllocationRow
  changes:        RowChanges
  activePatterns: Set<EditPattern>
  issues:         ValidationIssue[]
  /** 人物名（空席ポジションは ''） */
  personName:     string
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
  const { allocationList, afterOrganizations, beforeOrganizations, masters, orgMapping, persons } = useScopedStore()

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

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  // RowRuleCtx: lazy getter（orgById・orgByCode 等）のコストを全行で共有するため、
  // rows のループ全体で 1 インスタンスだけ生成する（batchValidate.ts と同じパターン。
  // 共有しないと validateRow 内で行ごとに O(組織数) の再構築が発生する）。
  const rowRuleCtx = useMemo(() => new RowRuleCtx(masters, afterOrganizations), [masters, afterOrganizations])

  const rows = useMemo((): ReviewRow[] => {
    const perfLabel = `[perf] useReviewData rows build (${allocationList.length} rows)`
    // eslint-disable-next-line no-console
    console.time(perfLabel)
    const result = allocationList.map(row => {
      const changes    = detectPatterns(row, detectCtx)
      const person     = row.userId ? personBySfId.get(row.userId as string) : undefined
      return {
        row,
        changes,
        activePatterns: changes.patterns,
        issues:         validateRow({ row, afterOrganizations, masters, allocationList: [], changes, rowRuleCtx }),
        personName:     person?.name ?? '',
      }
    })
    // eslint-disable-next-line no-console
    console.timeEnd(perfLabel)
    return result
  }, [allocationList, afterOrganizations, masters, detectCtx, personBySfId, rowRuleCtx])

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
