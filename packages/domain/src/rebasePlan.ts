/**
 * リベース計画の計算 — 新しい「要員配置リスト」（Prevが最新化され、Afterはまっさら）を
 * 受け取ったとき、現在作業中の After 編集を新しい Prev ベースの上に引っ越す。
 *
 * マッチングキーは No.（AllocationRow.no）。groupEmployeeId・departmentCode は
 * 正式なIDではなく、部署コード自体が変わりうるためマッチキーに使えない。
 *
 * 新しい Prev は絶対の正として保持し、現在行に実際の After 編集があった場合のみ、
 * その業務フィールド値を新しい行に合成する。合成結果のバリデーションは呼び出し側の
 * 責務（このモジュールは参考情報として issue 件数だけ計算する）。
 */

import type { AllocationRow } from './allocationRow'
import { FIELD_METADATA, META_FIELDS } from './allocationRow'
import type { AllMasters } from './masters/aggregate'
import type { Organization } from './schemas'
import type { RowContext } from './context'
import { validateRow } from './rules/validate/validateRow'

export interface RebasePlanRow {
  /** row.no */
  key:  string
  kind: 'added' | 'removed' | 'modified'
  /** 適用（承認）した場合に反映する行。added/modified のみ */
  candidateRow?: AllocationRow
  /** 合成後の候補行にバリデーション問題があるかどうか（参考情報。適用のブロックはしない） */
  hasValidationIssues: boolean
}

const AFTER_FIELDS = FIELD_METADATA.map(m => m.after)

/** row の after フィールドが before（prev）と異なるか（＝実際に編集されたか） */
function hasAfterEdits(row: AllocationRow): boolean {
  return FIELD_METADATA.some(m => (row[m.before] ?? '') !== (row[m.after] ?? ''))
}

/**
 * currentRow の after フィールド値・meta フィールド値（ID・氏名・異動事由・メモ等。
 * before/after ペアを持たないため hasAfterEdits では検出できないが、No.をキーに
 * 引き継ぐという原則は業務フィールドと同じなので、候補行には常に現在値を反映する）を
 * newBaseRow に合成した候補行を作る。
 */
function buildCandidateRow(newBaseRow: AllocationRow, currentRow: AllocationRow): AllocationRow {
  const candidate: AllocationRow = { ...newBaseRow }
  for (const key of AFTER_FIELDS) {
    ;(candidate as Record<string, unknown>)[key] = currentRow[key]
  }
  for (const key of META_FIELDS) {
    ;(candidate as Record<string, unknown>)[key] = currentRow[key]
  }
  return candidate
}

export interface RebasePlan {
  /**
   * 実編集のない行（マッチしたが hasAfterEdits === false）。
   * 何もレビューせずそのまま新側に置き換えてよい安全な行なので、レビュー対象には含めない。
   */
  autoReplaceRows: AllocationRow[]
  /** レビューが必要な行（追加候補・消えた行・実編集を引き継いだ変更候補） */
  reviewRows: RebasePlanRow[]
}

export function computeRebasePlan(
  currentList:        AllocationRow[],
  newBaseList:        AllocationRow[],
  masters:            AllMasters,
  afterOrganizations: Organization[],
): RebasePlan {
  const currentByNo = new Map<string, AllocationRow>()
  for (const r of currentList) {
    const no = r.no?.trim()
    if (no) currentByNo.set(no, r)
  }
  const newByNo = new Map<string, AllocationRow>()
  for (const r of newBaseList) {
    const no = r.no?.trim()
    if (no) newByNo.set(no, r)
  }

  const checkIssues = (row: AllocationRow): boolean => {
    const ctx: RowContext = { row, afterOrganizations, masters, allocationList: [] }
    return validateRow(ctx).length > 0
  }

  const autoReplaceRows: AllocationRow[] = []
  const reviewRows: RebasePlanRow[] = []

  for (const [no, newRow] of newByNo) {
    const currentRow = currentByNo.get(no)

    if (!currentRow) {
      // 新マスタにのみ存在する行 → 追加候補（レビュー対象）
      reviewRows.push({ key: no, kind: 'added', candidateRow: newRow, hasValidationIssues: checkIssues(newRow) })
      continue
    }

    if (!hasAfterEdits(currentRow)) {
      // 現在行に実編集がない → レビュー不要。そのまま新側で置き換える
      autoReplaceRows.push(newRow)
      continue
    }

    // 新Prev + 旧Afterを合成（レビュー対象）
    const candidate = buildCandidateRow(newRow, currentRow)
    reviewRows.push({ key: no, kind: 'modified', candidateRow: candidate, hasValidationIssues: checkIssues(candidate) })
  }

  // 新マスタに存在しない現在行 → 消えた行（確認のみ・削除アクションなし）
  for (const [no] of currentByNo) {
    if (!newByNo.has(no)) {
      reviewRows.push({ key: no, kind: 'removed', hasValidationIssues: false })
    }
  }

  return { autoReplaceRows, reviewRows }
}
