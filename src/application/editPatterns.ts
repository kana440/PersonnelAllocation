import type { ChangeKind } from '../domain/review/changeDetection'
import type { AllocationRow } from '../domain/allocationRow'

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
   * prev フィールドなどに基づく表示条件。
   * undefined = 常に表示。false = 非表示（available にも active にも出ない）。
   */
  availableWhen?: (row: AllocationRow) => boolean
}

export const EDIT_PATTERN_META: Record<EditPattern, EditPatternMeta> = {
  orgTransfer: {
    label: '組織異動', addLabel: '組織異動を追加', editLabel: '組織異動を変更',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  promotionDemotion: {
    label: '昇降格', addLabel: '昇降格を追加', editLabel: '昇降格を変更',
    badgeColor: 'bg-green-100 text-green-700',
  },
  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更を追加', editLabel: 'ジョブタイプ変更を変更',
    badgeColor: 'bg-purple-100 text-purple-700',
  },
  resignation: {
    label: '退職', addLabel: '退職を設定', editLabel: '退職メモを編集',
    badgeColor: 'bg-red-100 text-red-700',
  },
  vacantPositionMove: {
    label: 'ポジション異動', addLabel: '空きポジションへ異動', editLabel: '異動先ポジションを変更',
    badgeColor: 'bg-cyan-100 text-cyan-700',
  },
  secondmentRelease: {
    label: '出向解除', addLabel: '出向解除を設定', editLabel: '出向解除を変更',
    badgeColor: 'bg-amber-100 text-amber-700',
    // prev の雇用タイプが出向のときのみ表示
    availableWhen: row => ((row.prevEmploymentType as string | undefined) ?? '').includes('出向'),
  },
}

// ChangeKind → active パターンへのマッピング
const KIND_TO_PATTERN: Partial<Record<ChangeKind, EditPattern>> = {
  transfer:    'orgTransfer',
  promotion:   'promotionDemotion',
  demotion:    'promotionDemotion',
  bandChange:  'promotionDemotion',
  titleChange: 'promotionDemotion',
}

const ALL_PATTERNS: EditPattern[] = [
  'orgTransfer',
  'promotionDemotion',
  'jobTypeChange',
  'resignation',
  'vacantPositionMove',
  'secondmentRelease',
]

export function deriveEditPatternState(
  kinds: Set<ChangeKind>,
  row: AllocationRow,
): { active: EditPattern[]; available: EditPattern[] } {
  const active = new Set<EditPattern>()

  // ChangeKind ベースの active 判定
  for (const kind of kinds) {
    const p = KIND_TO_PATTERN[kind]
    if (p) active.add(p)
  }

  // jobTypeChange: jobFamily or jobType が prev と違う
  if (
    ((row.jobFamily ?? '') !== (row.prevJobFamily ?? '')) ||
    ((row.jobType   ?? '') !== (row.prevJobType   ?? ''))
  ) {
    active.add('jobTypeChange')
  }

  // resignation: transferReason が退職系キーワード
  const tr = (row.transferReason as string | undefined) ?? ''
  if (tr.includes('退職') || tr.includes('退任')) {
    active.add('resignation')
  }

  // secondmentRelease: prev が出向で after が出向でない
  const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
  const afterEt = (row.employmentType     as string | undefined) ?? ''
  if (prevEt.includes('出向') && !afterEt.includes('出向') && afterEt !== '') {
    active.add('secondmentRelease')
  }

  // vacantPositionMove: positionCode が prev と変わっている
  if (
    (row.positionCode ?? '') !== '' &&
    (row.positionCode ?? '') !== (row.prevPositionCode ?? '')
  ) {
    active.add('vacantPositionMove')
  }

  // available = active でない かつ availableWhen 条件を満たすもの
  return {
    active:    ALL_PATTERNS.filter(p =>  active.has(p) && meetsCondition(p, row)),
    available: ALL_PATTERNS.filter(p => !active.has(p) && meetsCondition(p, row)),
  }
}

function meetsCondition(pattern: EditPattern, row: AllocationRow): boolean {
  const cond = EDIT_PATTERN_META[pattern].availableWhen
  return cond === undefined || cond(row)
}
