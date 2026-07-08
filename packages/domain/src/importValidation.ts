/**
 * マージ/リベースの取り込み元ファイル用バリデーション。
 *
 * groupEmployeeId・departmentCode は正式なIDではなく、業務運用上は Excel の
 * No.列（AllocationRow.no）が唯一の一意キーとして扱われる。マージ/リベースの
 * 行マッチングは no を前提にするため、取り込み元ファイルは no が全行に存在し
 * 重複がないことを事前に保証する必要がある。
 */

import type { AllocationRow } from './allocationRow'

export interface NoColumnValidationResult {
  ok:     boolean
  errors: string[]
}

export function validateNoColumn(rows: AllocationRow[]): NoColumnValidationResult {
  const errors: string[] = []
  const seen = new Map<string, number>()

  for (const row of rows) {
    const no = row.no?.trim()
    if (!no) {
      errors.push(`No. が未入力の行があります（rowId: ${row.rowId}）`)
      continue
    }
    const firstRowId = seen.get(no)
    if (firstRowId !== undefined) {
      errors.push(`No. 「${no}」が重複しています（rowId: ${firstRowId} と ${row.rowId}）`)
      continue
    }
    seen.set(no, row.rowId)
  }

  return { ok: errors.length === 0, errors }
}
