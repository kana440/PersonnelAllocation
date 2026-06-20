// backward-compat re-export: 新コードは detection/ から直接 import してください
import type { AllocationRow } from '../allocationRow'
import { EMPTY_MASTERS } from '../masters/aggregate'
import { detectPatterns } from './detection'

export type { RowChanges }                       from './detection'
export { parseBandLevel, parsePositionBandRange } from './detection/helpers'

// 旧シグネチャ互換ラッパー（テスト・既存コードから呼ばれる）
export function detectChanges(row: AllocationRow, sameOrgPairs?: Set<string>) {
  return detectPatterns(row, sameOrgPairs ? {
    allocationList:     [],
    afterOrganizations: [],
    masters:          EMPTY_MASTERS,
    sameOrgPairs,
  } : undefined)
}
