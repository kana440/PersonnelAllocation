import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'

export type EditPattern =
  | 'orgTransfer'
  | 'promotionDemotion'
  | 'jobTypeChange'
  | 'resignation'
  | 'vacantPositionMove'
  | 'secondmentRelease'

export interface EditPatternMeta {
  label:      string
  addLabel:   string
  editLabel:  string
  badgeColor: string
  /**
   * この操作が対象行に対して追加可能かどうか（available リストのゲート）。
   * undefined = 常に available。
   * active 判定（変更検出済み）には影響しない。
   */
  availableFor?: (row: AllocationRow, codeLists: AllCodeLists) => boolean
}

function isOutsource(row: AllocationRow, cl: AllCodeLists): boolean {
  const et = row.employmentType as string | undefined
  if (!et) return false
  const entry = cl.employmentTypes.find(e => e.label === et || e.code === et)
  return entry?.isOutsourceAcceptance ?? false
}

export const ALL_EDIT_PATTERNS: EditPattern[] = [
  'orgTransfer',
  'promotionDemotion',
  'jobTypeChange',
  'resignation',
  'vacantPositionMove',
  'secondmentRelease',
]

export const EDIT_PATTERN_META: Record<EditPattern, EditPatternMeta> = {
  orgTransfer: {
    label: '組織異動', addLabel: '組織異動を追加', editLabel: '組織異動を変更',
    badgeColor: 'bg-blue-100 text-blue-700',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  promotionDemotion: {
    label: '昇降格', addLabel: '昇降格を追加', editLabel: '昇降格を変更',
    badgeColor: 'bg-green-100 text-green-700',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更を追加', editLabel: 'ジョブタイプ変更を変更',
    badgeColor: 'bg-purple-100 text-purple-700',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  resignation: {
    label: '退職', addLabel: '退職を設定', editLabel: '退職メモを編集',
    badgeColor: 'bg-red-100 text-red-700',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  vacantPositionMove: {
    label: 'ポジション異動', addLabel: '空きポジションへ異動', editLabel: '異動先ポジションを変更',
    badgeColor: 'bg-cyan-100 text-cyan-700',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  secondmentRelease: {
    label: '出向解除', addLabel: '出向解除を設定', editLabel: '出向解除を変更',
    badgeColor: 'bg-amber-100 text-amber-700',
    availableFor: (row, cl) => isOutsource(row, cl),
  },
}
