import type { ChangeKind } from '../review/changeDetection'
import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'
import { EDIT_PATTERN_META, ALL_EDIT_PATTERNS, type EditPattern } from './patterns'

const KIND_TO_PATTERN: Partial<Record<ChangeKind, EditPattern>> = {
  transfer:    'orgTransfer',
  promotion:   'promotionDemotion',
  demotion:    'promotionDemotion',
  bandChange:  'promotionDemotion',
  titleChange: 'promotionDemotion',
}

/**
 * 行の変更種別とフィールド差分から EditPattern の active/available を導出する。
 *
 * - active  : すでに変更が設定されているパターン（常に表示）
 * - available: まだ設定されていないが操作可能なパターン（codeLists がある場合 availableFor でゲート）
 *
 * codeLists を省略するとバッジ表示専用モードとなり、availableFor を評価しない。
 */
export function deriveEditPatterns(
  kinds: Set<ChangeKind>,
  row: AllocationRow,
  codeLists?: AllCodeLists,
): { active: EditPattern[]; available: EditPattern[] } {
  const active = new Set<EditPattern>()

  for (const kind of kinds) {
    const p = KIND_TO_PATTERN[kind]
    if (p) active.add(p)
  }

  if (
    ((row.jobFamily ?? '') !== (row.prevJobFamily ?? '')) ||
    ((row.jobType   ?? '') !== (row.prevJobType   ?? ''))
  ) {
    active.add('jobTypeChange')
  }

  const tr = (row.transferReason as string | undefined) ?? ''
  if (tr.includes('退職') || tr.includes('退任')) {
    active.add('resignation')
  }

  const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
  const afterEt = (row.employmentType     as string | undefined) ?? ''
  if (prevEt.includes('出向') && !afterEt.includes('出向') && afterEt !== '') {
    active.add('secondmentRelease')
  }

  if (
    (row.positionCode ?? '') !== '' &&
    (row.positionCode ?? '') !== (row.prevPositionCode ?? '')
  ) {
    active.add('vacantPositionMove')
  }

  const canAdd = (p: EditPattern): boolean => {
    if (!codeLists) return true
    const cond = EDIT_PATTERN_META[p].availableFor
    return cond === undefined || cond(row, codeLists)
  }

  return {
    active:    ALL_EDIT_PATTERNS.filter(p =>  active.has(p)),
    available: ALL_EDIT_PATTERNS.filter(p => !active.has(p) && canAdd(p)),
  }
}
