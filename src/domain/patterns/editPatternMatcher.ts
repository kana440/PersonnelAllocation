import type { ChangeKind } from '../patterns/changeDetection'
import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../masters/aggregate'
import { EDIT_PATTERN_META, ALL_EDIT_PATTERNS, type EditPattern } from './editPatterns'

/**
 * 行の変更差分（ChangeKind と個別フィールド差分）から EditPattern の active/available を導出する。
 *
 * active  : すでに変更が設定されているパターン（常に表示）
 * available: まだ設定されていないが操作可能なパターン（codeLists がある場合 availableFor でゲート）
 *
 * codeLists を省略するとバッジ表示専用モードとなり、availableFor を評価しない。
 */
export function deriveEditPatterns(
  kinds: Set<ChangeKind>,
  row: AllocationRow,
  codeLists?: AllCodeLists,
): { active: EditPattern[]; available: EditPattern[] } {
  const active = new Set<EditPattern>()

  // ── 昇降格・職務情報系 ────────────────────────────────────────────────────
  if (kinds.has('promotion'))  active.add('promotion')
  if (kinds.has('demotion'))   active.add('demotion')
  if (kinds.has('bandChange')) {
    // bandChange は昇降格なし or 役職変更の可能性があるが、promotion/demotion が優先
    if (!kinds.has('promotion') && !kinds.has('demotion')) {
      active.add('titleChange')
    }
  }
  if (kinds.has('titleChange') && !kinds.has('promotion') && !kinds.has('demotion')) {
    active.add('titleChange')
  }

  if (
    (row.jobFamily ?? '') !== (row.prevJobFamily ?? '') ||
    (row.jobType   ?? '') !== (row.prevJobType   ?? '')
  ) {
    active.add('jobTypeChange')
  }

  // ── ポジション系 ──────────────────────────────────────────────────────────
  if (kinds.has('transfer')) {
    // 移動先が after 組織リストに存在する → 社内異動、存在しない → 組織改変
    // シンプルな判定: prevDepartmentCode が消えていない場合は orgTransfer
    // 組織改変の精密判定は validateConsistency 側で行う
    active.add('orgTransfer')
  }

  // 前の組織コードが存在しないが departmentCode は変わっている → 組織改変の可能性
  if (
    (row.prevDepartmentCode ?? '') !== '' &&
    (row.departmentCode ?? '') !== '' &&
    (row.departmentCode ?? '') !== (row.prevDepartmentCode ?? '') &&
    (row.prevPositionCode ?? '') !== '' &&
    (row.positionCode ?? '') === (row.prevPositionCode ?? '')  // positionCode は同じ
  ) {
    active.add('orgRestructure')
  }

  if ((row.managerPositionCode ?? '') !== (row.prevManagerPositionCode ?? '')) {
    active.add('managerChange')
  }

  // 兼務追加（新規兼務行）
  if (
    !row.prevConcurrentType && row.concurrentType === '兼務' &&
    !row.prevSecondmentToCompany && !row.prevSecondmentFromCompany
  ) {
    active.add('concurrentAdd')
  }

  // ── 出向系 ────────────────────────────────────────────────────────────────
  const prevSecOut = row.prevSecondmentToCompany   as string | undefined
  const afterSecOut = row.secondmentToCompany      as string | undefined
  const prevSecIn  = row.prevSecondmentFromCompany as string | undefined
  const afterSecIn  = row.secondmentFromCompany    as string | undefined
  const isConcurrent = row.concurrentType === '兼務'
  const wasConcurrent = row.prevConcurrentType === '兼務'

  if (!prevSecOut && afterSecOut) {
    active.add(isConcurrent ? 'concurrentSecondmentOut' : 'secondmentOut')
  }
  if (!prevSecIn && afterSecIn) {
    active.add(isConcurrent ? 'concurrentSecondmentIn' : 'secondmentIn')
  }
  if (prevSecOut && !afterSecOut && !isConcurrent) {
    active.add('secondmentOutRelease')
  }
  if (prevSecIn && !afterSecIn && !isConcurrent) {
    active.add('secondmentInRelease')
  }
  if (prevSecOut && !afterSecOut && wasConcurrent && !row.departmentCode) {
    active.add('concurrentSecondmentOutRelease')
  }
  if (prevSecIn && !afterSecIn && wasConcurrent && !row.departmentCode) {
    active.add('concurrentSecondmentInRelease')
  }

  // ── 人操作系 ──────────────────────────────────────────────────────────────
  const prevLeave  = row.prevLeaveFlag as string | undefined
  const afterLeave = row.leaveFlag     as string | undefined
  if (!prevLeave && afterLeave)  active.add('leaveOfAbsence')
  if (prevLeave  && !afterLeave) active.add('returnFromLeave')

  const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
  const afterEt = (row.employmentType     as string | undefined) ?? ''

  if (prevEt && !afterEt) {
    active.add('employmentTransferOut')
  }
  if (!prevEt && afterEt && kinds.has('newHire')) {
    active.add('employmentTransferIn')
  }

  if (prevEt && !afterEt.includes('出向') && prevEt.includes('出向')) {
    // 出向→通常への変更（出向解除）: secondmentRelease 系で処理済みの場合は重複しない
    if (!active.has('secondmentOutRelease') && !active.has('secondmentInRelease')) {
      // 後方互換: 旧 secondmentRelease パターンに対応する行
    }
  }

  // 変更なし（transferReason が設定済みかつ after フィールドに差分なし）
  const tr = (row.transferReason as string | undefined) ?? ''
  const hasNoFieldDiff =
    (row.departmentCode     ?? '') === (row.prevDepartmentCode     ?? '') &&
    (row.band               ?? '') === (row.prevBand               ?? '') &&
    (row.positionCode       ?? '') === (row.prevPositionCode       ?? '') &&
    (row.employmentType     ?? '') === (row.prevEmploymentType     ?? '') &&
    (row.concurrentType     ?? '') === (row.prevConcurrentType     ?? '')
  if (tr && hasNoFieldDiff && active.size === 0) {
    active.add('noChange')
  }

  // ── 後方互換（既存パターン） ────────────────────────────────────────────
  if (tr.includes('退職') || tr.includes('退任')) {
    active.add('resignation')
  }
  if (
    (row.positionCode ?? '') !== '' &&
    (row.positionCode ?? '') !== (row.prevPositionCode ?? '') &&
    !kinds.has('transfer')
  ) {
    active.add('vacantPositionMove')
  }

  // ── 雇用延長検出 ─────────────────────────────────────────────────────────
  if (prevEt !== afterEt && afterEt && prevEt) {
    // 同組織内の雇用タイプ変更のみ（異動なし）
    if ((row.departmentCode ?? '') === (row.prevDepartmentCode ?? '')) {
      active.add('employmentExtension')
    }
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
