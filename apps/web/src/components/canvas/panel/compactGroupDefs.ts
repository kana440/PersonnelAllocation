import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters }    from '@personnel/domain/masters/aggregate'

export interface CompactGroupDef {
  id:       string
  label:    string
  /** AllocationRow からグループキーを取り出す */
  getKey:   (row: AllocationRow) => string
  /** グループキー配列を表示順に並び替える。(未設定) は末尾 */
  sortKeys: (keys: string[], masters: AllMasters) => string[]
}

const UNSET = '(未設定)'

/** マスタ配列の出現順でソート。(未設定) は末尾 */
function byMasterOrder(keys: string[], labels: string[]): string[] {
  const orderMap = new Map(labels.map((l, i) => [l, i]))
  return [...keys].sort((a, b) => {
    if (a === UNSET) return 1
    if (b === UNSET) return -1
    return (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999)
  })
}

export const COMPACT_GROUP_DEFS: CompactGroupDef[] = [
  {
    id:       'positionBand',
    label:    'バンド',
    getKey:   row => (row.positionBand as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => {
      const levelMap = new Map(
        masters.jobLevels.map(e => [e.label, e.promotionDemotionWarningLevel ?? -1])
      )
      return [...keys].sort((a, b) => {
        if (a === UNSET) return 1
        if (b === UNSET) return -1
        return (levelMap.get(b) ?? -1) - (levelMap.get(a) ?? -1)  // 降順（高バンドが上）
      })
    },
  },
  {
    id:       'location',
    label:    '勤務場所',
    getKey:   row => (row.location as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.workLocations.map(e => e.label)),
  },
  {
    id:       'officialPositionCode',
    label:    '役職',
    getKey:   row => (row.officialPositionCode as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.officialPositions.map(e => e.label)),
  },
  {
    id:       'jobType',
    label:    'ジョブタイプ',
    getKey:   row => (row.jobType as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.jobTypes.map(e => e.label)),
  },
  {
    id:       'concurrentType',
    label:    '本務/兼務',
    getKey:   row => (row.concurrentType as string | undefined) ?? '本務',
    sortKeys: (keys) => {
      const order: Record<string, number> = { '本務': 0, '兼務': 1 }
      return [...keys].sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99))
    },
  },
]

export const DEFAULT_COMPACT_GROUP_ID = 'positionBand'
