import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { AllocationRow } from '../allocationRow'
import type { RowContext } from '../context'
import type { ValidationIssue } from './types'
import { runRequired }    from './validateRequired'
import { runFormat }      from './validateFormat'
import { runRelated }     from './validateRelated'
import { runExistence }   from './validateExistence'
import { runKeys }        from './validateKeys'
import { runConsistency } from './validateConsistency'
import type { FieldStrictness } from '../optionStrictness'

export type { ValidationLevel, ValidationIssue } from './types'

// ── メインバリデーション関数 ─────────────────────────────────────────────────
// ルーティング:
//   transferReason の noCheckRequired === true → E系（キー重複）のみ
//   それ以外 → A/B/D/E/F/G/W 全系を実行
export function validateRow(
  ctx:       RowContext,
  overrides?: Partial<Record<string, FieldStrictness>>,
): ValidationIssue[] {
  const { row, afterOrganizations: orgs, codeLists, allocationList, changes } = ctx
  const reasonEntry = codeLists.transferReasons.find(r => r.label === row.transferReason)

  if (reasonEntry?.noCheckRequired) {
    return allocationList.length > 0 ? runKeys(row, allocationList) : []
  }

  return [
    ...runRequired(row, codeLists),
    ...runFormat(row),
    ...runRelated(row, codeLists, overrides),
    ...runExistence(row, orgs, codeLists, overrides),
    ...(allocationList.length > 0 ? runKeys(row, allocationList) : []),
    ...runConsistency(row, codeLists, changes),
  ]
}

// ── フィールドごとのイシュー抽出ヘルパー ─────────────────────────────────────
export function issuesForField(
  issues: ValidationIssue[],
  field:  keyof AllocationRow,
): ValidationIssue[] {
  return issues.filter(i => i.field === field)
}

// ── 差分フィールドまたはイシューがある after フィールドの集合を返す ──────────
// RowEditorPanel でデフォルト表示する行を決めるために使用
export function fieldsToShow(
  row:    AllocationRow,
  issues: ValidationIssue[],
): Set<keyof AllocationRow> {
  const fields = new Set<keyof AllocationRow>()
  const issueFields = new Set(issues.map(i => i.field))

  for (const [afterKey, prevKey] of BEFORE_AFTER_FIELD_PAIRS) {
    const prevVal  = (row[prevKey]  as string | undefined) ?? ''
    const afterVal = (row[afterKey] as string | undefined) ?? ''
    if (prevVal !== afterVal || issueFields.has(afterKey)) {
      fields.add(afterKey)
    }
  }
  fields.add('transferReason' as keyof AllocationRow)
  return fields
}
