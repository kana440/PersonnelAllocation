import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA } from '../../allocationRow'

/**
 * afterConstraint: 'preserve' の実装。
 * after フィールドを全て対応する before 値にコピーした差分オブジェクトを返す。
 *
 * operationRole に afterConstraint: 'preserve' を宣言した createCommand().apply() で使う:
 *   { ...r, ...preserve(row), <固有フィールド> }
 */
export function preserve(row: AllocationRow): Partial<AllocationRow> {
  const result: Partial<AllocationRow> = {}
  for (const { after, before } of FIELD_METADATA) {
    ;(result as Record<string, unknown>)[after as string] =
      (row as Record<string, unknown>)[before as string]
  }
  return result
}
