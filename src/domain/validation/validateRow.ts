import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { AllocationRow } from '../allocationRow'
import type { Organization } from '../schemas'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { RowChanges } from '../review/changeDetection'
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
//   それ以外 → A/B/D/E/F 全系を実行
export function validateRow(
  row:        AllocationRow,
  orgs:       Organization[],
  codeLists:  AllCodeLists,
  changes?:   RowChanges,
  allRows?:   AllocationRow[],
  overrides?: Partial<Record<string, FieldStrictness>>,
): ValidationIssue[] {
  const reasonEntry = codeLists.transferReasons.find(r => r.label === row.transferReason)

  if (reasonEntry?.noCheckRequired) {
    return allRows ? runKeys(row, allRows) : []
  }

  return [
    ...runRequired(row, codeLists),
    ...runFormat(row),
    ...runRelated(row, codeLists, overrides),
    ...runExistence(row, orgs, codeLists, overrides),
    ...(allRows ? runKeys(row, allRows) : []),
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
