import type { AllocationRow } from '../../allocationRow'
import type { ValidationIssue } from '../validate/types'

/**
 * ValidationIssue の種別ごとに「どのフィールドをどう変更すれば解決できるか」を宣言する。
 *
 * EditOperation / EditCommand の関係に対応する概念：
 *   ValidationResolutionDef  ←→  EditOperation（フォーム定義・条件宣言）
 *
 * UI・AI からは次のように使う：
 *   1. issueGroups を ValidationResolutionDef.match で分類する
 *   2. ユーザーが値を入力したら patch() でフィールドパッチを取得
 *   3. 確定したら呼び出し側で new DirectEditOperation(rowId, patch, label) を生成して実行
 *
 * ルール層（rules/）はコマンド層（commands/）に依存しないため、
 * EditCommand の生成は呼び出し側（Application層）の責務とする。
 */
export interface ValidationResolutionDef {
  /** 一意ID */
  readonly id: string

  /** 解決対象の ValidationIssue を識別する述語 */
  match(issue: ValidationIssue): boolean

  /** フィルタ用短ラベル (≤8文字) */
  readonly shortLabel: string

  /** 一括修正で変更するフィールド */
  readonly field: keyof AllocationRow

  /** フォームラベル（省略時はフィールド名から自動取得）*/
  readonly label?: string

  /** バリデーションレベルに基づく表示分類 */
  readonly level: 'error' | 'warning'

  /**
   * 修正値から適用するフィールドパッチを返す。
   * 呼び出し側が new DirectEditOperation(rowId, patch, label) でコマンド化する。
   */
  patch(row: AllocationRow, values: Partial<AllocationRow>): Partial<AllocationRow>
}
