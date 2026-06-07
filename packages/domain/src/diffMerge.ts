/**
 * スナップショット・3-way merge — 委任ワークフロー用
 *
 * 設計: docs/14-delegation-model.md
 * 実装仕様: specs/G8-delegation/01-snapshot-merge.md
 *
 * diff/merge 対象は FIELD_METADATA の after フィールド（業務フィールド）のみ。
 * prevXxx・rowId・positionCode・userId 等の識別子・メタフィールドは対象外。
 */

import type { AllocationRow } from './allocationRow'
import { FIELD_METADATA }     from './allocationRow'

// ── computeRowDiffs ───────────────────────────────────────────────────────────
// STEP1 追加取り込みプレビュー / STEP2 DiffReviewView の共用 diff 計算。

export interface RowChangeSummary {
  rowId:       number
  kind:        'added' | 'removed' | 'modified'
  displayName: string
  orgCode?:    string
  changes:     FieldChange[]
}

export interface FieldChange {
  fieldKey: string
  before:   string | undefined
  after:    string | undefined
}

/** diff/merge の対象となる業務フィールドキー一覧（FIELD_METADATA.after から導出）*/
const DIFF_FIELDS = FIELD_METADATA.map(m => m.after) as (keyof AllocationRow)[]

function rowDisplayName(row: AllocationRow): string {
  const r = row as AllocationRow & { lastName?: string; firstName?: string; userId?: string }
  const name = [r.lastName, r.firstName].filter(Boolean).join('')
  if (name) return name
  if (r.userId) return r.userId
  const rc = row as AllocationRow & { positionCode?: string }
  return rc.positionCode ?? `row${row.rowId}`
}

/**
 * 2つの AllocationRow 配列の差分を計算する。
 *
 * @param before  変更前の行リスト
 * @param after   変更後の行リスト
 * @param matchFn 行の照合キー。null を返すと diff 対象外。
 *                デフォルト: rowId で照合（STEP2 用）
 *                STEP1 用:   r => r.groupEmployeeId ? `${r.groupEmployeeId}|${r.departmentCode ?? ''}` : null
 */
export function computeRowDiffs(
  before:  AllocationRow[],
  after:   AllocationRow[],
  matchFn: (r: AllocationRow) => string | null = r => String(r.rowId),
): RowChangeSummary[] {
  const beforeMap = new Map<string, AllocationRow>()
  for (const r of before) {
    const k = matchFn(r)
    if (k != null) beforeMap.set(k, r)
  }

  const afterMap = new Map<string, AllocationRow>()
  for (const r of after) {
    const k = matchFn(r)
    if (k != null) afterMap.set(k, r)
  }

  const results: RowChangeSummary[] = []

  // added: after にあって before にない
  for (const [k, aRow] of afterMap) {
    if (!beforeMap.has(k))
      results.push({ rowId: aRow.rowId, kind: 'added', displayName: rowDisplayName(aRow), orgCode: aRow.departmentCode, changes: [] })
  }

  // removed: before にあって after にない
  for (const [k, bRow] of beforeMap) {
    if (!afterMap.has(k))
      results.push({ rowId: bRow.rowId, kind: 'removed', displayName: rowDisplayName(bRow), orgCode: bRow.departmentCode, changes: [] })
  }

  // modified: 両方にあるが業務フィールドが変化している
  for (const [k, bRow] of beforeMap) {
    const aRow = afterMap.get(k)
    if (!aRow) continue
    const changes: FieldChange[] = []
    for (const key of DIFF_FIELDS) {
      const bVal = bRow[key] as string | undefined
      const aVal = aRow[key] as string | undefined
      if (bVal !== aVal) changes.push({ fieldKey: String(key), before: bVal, after: aVal })
    }
    if (changes.length > 0)
      results.push({ rowId: aRow.rowId, kind: 'modified', displayName: rowDisplayName(aRow), orgCode: aRow.departmentCode, changes })
  }

  return results
}

// ── diffRow ──────────────────────────────────────────────────────────────────

/**
 * base から modified への変更フィールドを返す。
 * 値が変化したフィールドのみ含む Partial<AllocationRow>。
 * 対象は FIELD_METADATA の after フィールド（業務フィールド）のみ。
 */
export function diffRow(
  base:     AllocationRow,
  modified: AllocationRow,
): Partial<AllocationRow> {
  const patch: Partial<AllocationRow> = {}
  for (const key of DIFF_FIELDS) {
    if (base[key] !== modified[key]) {
      ;(patch as Record<string, unknown>)[key] = modified[key]
    }
  }
  return patch
}

// ── mergeRow ─────────────────────────────────────────────────────────────────

export interface MergeResult {
  merged:    AllocationRow
  /** coordinator が手動解決が必要なフィールド（両者が異なる値で変更した） */
  conflicts: (keyof AllocationRow)[]
}

/**
 * 3-way merge（フィールド単位）。
 *
 * @param base   委任時のスナップショット行（変更の起点）
 * @param ours   coordinator の現在値
 * @param theirs member の提出値
 *
 * 判定ルール:
 *   - theirs のみ変更 → theirs を採用
 *   - ours のみ変更   → ours を保持
 *   - 両方が同じ値に変更 → ours を保持（同値なので無問題）
 *   - 両方が異なる値に変更 → ours を保持 + conflict に追加
 *   - どちらも変更なし → ours を保持
 */
export function mergeRow(
  base:   AllocationRow,
  ours:   AllocationRow,
  theirs: AllocationRow,
): MergeResult {
  const merged    = { ...ours }
  const conflicts: (keyof AllocationRow)[] = []

  for (const key of DIFF_FIELDS) {
    const baseVal   = base[key]
    const oursVal   = ours[key]
    const theirsVal = theirs[key]

    const oursChanged   = baseVal !== oursVal
    const theirsChanged = baseVal !== theirsVal

    if (!theirsChanged) continue  // member が変更していなければ ours を保持

    if (!oursChanged) {
      // member のみ変更 → 採用
      ;(merged as Record<string, unknown>)[key] = theirsVal
    } else if (oursVal !== theirsVal) {
      // 両者が異なる値に変更 → conflict（ours を保持したまま記録）
      conflicts.push(key)
    }
    // oursVal === theirsVal: 同じ変更 → ours を保持（何もしない）
  }

  return { merged, conflicts }
}

// ── mergeSubmission ───────────────────────────────────────────────────────────

/**
 * Submission 全体の 3-way merge。
 * snapshot_data の各行を base として mergeRow を適用する。
 *
 * @param snapshotRows  委任時のスナップショット（submission.snapshot_data）
 * @param currentRows   coordinator の現在行（allocation_rows）
 * @param submittedRows member が提出した行
 * @returns rowId → MergeResult のマップ
 *
 * snapshot に存在しない rowId（coordinator が後から追加した行等）は merge 対象外。
 */
export function mergeSubmission(
  snapshotRows:   AllocationRow[],
  currentRows:    AllocationRow[],
  submittedRows:  AllocationRow[],
): Map<number, MergeResult> {
  const currentMap   = new Map(currentRows.map(r   => [r.rowId, r]))
  const submittedMap = new Map(submittedRows.map(r  => [r.rowId, r]))

  const results = new Map<number, MergeResult>()

  for (const base of snapshotRows) {
    const ours   = currentMap.get(base.rowId)
    const theirs = submittedMap.get(base.rowId)

    if (!ours || !theirs) continue  // 削除済み行はスキップ

    results.set(base.rowId, mergeRow(base, ours, theirs))
  }

  return results
}
