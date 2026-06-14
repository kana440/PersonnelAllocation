// 兼務追加の変更検知
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'

export function detectConcurrent(row: AllocationRow): Set<EditPattern> {
  const out = new Set<EditPattern>()

  // 新規兼務行（出向系でない社内兼務追加）
  if (
    !row.prevConcurrentType &&
    row.concurrentType === '兼務' &&
    !row.prevSecondmentToCompany &&
    !row.prevSecondmentFromCompany
  ) {
    out.add('concurrentAdd')
  }

  return out
}
