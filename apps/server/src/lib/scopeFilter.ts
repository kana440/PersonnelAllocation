import type { AllocationRow } from '@personnel/domain/allocationRow'

export type SubmissionScope =
  | { kind: 'all' }
  | { kind: 'org';       orgCodes: string[] }
  | { kind: 'level';     orgLevelMin: number; orgLevelMax?: number }
  | { kind: 'condition'; concurrentType: string }
  | { kind: 'manual';    rowIds: number[] }

export function resolveScope(scope: SubmissionScope, rows: AllocationRow[]): number[] {
  switch (scope.kind) {
    case 'all':
      return rows.map(r => r.rowId)
    case 'org':
      return rows.filter(r => scope.orgCodes.includes(r.departmentCode ?? '')).map(r => r.rowId)
    case 'level': {
      const max = scope.orgLevelMax ?? Infinity
      return rows.filter(r => {
        const lv = (r as Record<string, unknown>)['orgLevel'] as number | undefined
        if (lv === undefined) return false
        return lv >= scope.orgLevelMin && lv <= max
      }).map(r => r.rowId)
    }
    case 'condition':
      return rows.filter(r => r.concurrentType === scope.concurrentType).map(r => r.rowId)
    case 'manual':
      return scope.rowIds
  }
}

// 子スコープが親スコープに含まれているか検証
export function isScopeWithin(child: SubmissionScope, parentRowIds: Set<number>, allRows: AllocationRow[]): boolean {
  const childIds = resolveScope(child, allRows)
  return childIds.every(id => parentRowIds.has(id))
}
