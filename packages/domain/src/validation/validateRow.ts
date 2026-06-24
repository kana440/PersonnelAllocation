import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { AllocationRow } from '../allocationRow'
import type { RowContext } from '../context'
import type { ValidationIssue } from './types'
import { runAssertRequired }        from './validateAssertRequired'
import { runBasedOnFormat }         from './validateBasedOnFormat'
import { runCorrelation }           from './validateCorrelation'
import { runDataExistence }         from './validateDataExistence'
import { runExclusivity }           from './validateExclusivity'
import { runFilteredByEmployment }  from './validateFilteredByEmployment'
import { runGlobalConsistency }     from './validateGlobalConsistency'
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
  const { row, afterOrganizations: orgs, masters, allocationList, changes } = ctx
  const reasonEntry = masters.transferReasons.find(r => r.label === row.transferReason)

  if (reasonEntry?.noCheckRequired) {
    return allocationList.length > 0 ? runExclusivity(row, allocationList) : []
  }

  return [
    ...runAssertRequired(row, masters),
    ...runBasedOnFormat(row),
    ...runCorrelation(row, masters),
    ...runFilteredByEmployment(row, masters, overrides),
    ...runDataExistence(row, orgs, masters, overrides),
    ...(allocationList.length > 0 ? runExclusivity(row, allocationList) : []),
    ...runGlobalConsistency(row, masters, changes, allocationList, orgs),
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
