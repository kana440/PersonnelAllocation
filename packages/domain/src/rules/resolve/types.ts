import type { AllocationRow } from '../../allocationRow'
import type { EditCommand } from '../../commands/types'
import type { ValidationIssue } from '../validate/types'

/**
 * ValidationIssue の種別ごとに「どのフィールドをどう変更すれば解決できるか」を宣言する。
 *
 * EditOperation / EditCommand の関係に対応する概念：
 *   ValidationResolutionDef  ←→  EditOperation（フォーム定義・条件宣言）
 *   createCommand が返す EditCommand  ←→  EditCommand（validate/apply 実装）
 *
 * UI・AI からは次のように使う：
 *   1. issueGroups を ValidationResolutionDef.match で分類する
 *   2. ユーザーが値を入力したら dryRunResolution() でプレビュー
 *   3. 確定したら createCommand(rowId, values).apply(ctx) で実行
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

  /** 行の現在状態から修正値を提案する（省略時は空欄）*/
  suggestValue?(row: AllocationRow): string | undefined

  /** 指定フィールドの修正値で EditCommand を生成する */
  createCommand(rowId: number, values: Partial<AllocationRow>): EditCommand
}
