import type { AllocationRow } from '../allocationRow'
import type { IOperationPattern, PatternDetectionResult } from './groupPatternTypes'

// groupEmployeeId でレコードをグループ化
function groupByGroupEmployeeId(rows: AllocationRow[]): Map<string, AllocationRow[]> {
  const map = new Map<string, AllocationRow[]>()
  for (const row of rows) {
    const key = row.groupEmployeeId ?? row.userId ?? String(row.rowId)
    const bucket = map.get(key) ?? []
    bucket.push(row)
    map.set(key, bucket)
  }
  return map
}

/**
 * 全行に対してパターン判定を実行し、結果をキャッシュとして返す
 * allocationList 変更のたびに HRApplicationService が呼び出す
 */
export function matchAllPatterns(
  allocationList: AllocationRow[],
  patterns:       IOperationPattern[]
): Map<string, PatternDetectionResult> {
  const result = new Map<string, PatternDetectionResult>()
  const groups = groupByGroupEmployeeId(allocationList)

  for (const [groupEmployeeId, rows] of groups) {
    const candidates = patterns
      .map(pattern => ({ pattern, result: pattern.match(rows) }))
      .filter(c => c.result.confidence > 0)
      .sort((a, b) => b.result.confidence - a.result.confidence)

    const detected = candidates.find(c => c.result.matched)?.pattern ?? null

    result.set(groupEmployeeId, { groupEmployeeId, rows, detected, candidates })
  }

  return result
}
