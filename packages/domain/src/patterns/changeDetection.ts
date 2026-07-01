// backward-compat re-export: 新コードは detection/ から直接 import してください
import type { AllocationRow } from '../allocationRow'
import type { AllMasters } from '../masters/aggregate'
import { EMPTY_MASTERS } from '../masters/aggregate'
import { detectPatterns } from './detection'

export type { RowChanges }                       from './detection'
export { parseBandLevel, parsePositionBandRange } from './detection/helpers'

// 旧シグネチャ互換ラッパー（テスト・既存コードから呼ばれる）
export function detectChanges(row: AllocationRow, sameOrgPairs?: Set<string>, masters?: AllMasters) {
  return detectPatterns(row, {
    allocationList:     [],
    afterOrganizations: [],
    masters:          masters ?? EMPTY_MASTERS,
    sameOrgPairs,
  })
}
