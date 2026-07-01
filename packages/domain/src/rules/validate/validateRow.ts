import { BEFORE_AFTER_FIELD_PAIRS } from '../../allocationRow'
import type { AllocationRow } from '../../allocationRow'
import type { RowContext } from '../../context'
import type { ValidationIssue } from './types'
import { ROW_RULES, RowRuleCtx } from '../rowRule'
import { runAssertRequired }    from './assertRequired'
import { runBasedOnFormat }     from './basedOnFormat'
import { runFromFieldRules }    from './fromFieldRules'
import { runExclusivity }       from './exclusivity'
import { runGlobalConsistency } from './globalConsistency'

// side-effect: ROW_RULES を row/index.ts で登録する
import '../row/index'

export type { ValidationLevel, ValidationIssue } from './types'

// ── メインバリデーション関数 ─────────────────────────────────────────────────
// ルーティング:
//   transferReason の noCheckRequired === true → E系（キー重複）のみ
//   それ以外 → A/B/C/D2/E/F/G/W 全系を実行
export function validateRow(ctx: RowContext): ValidationIssue[] {
  const { row, afterOrganizations: orgs, masters, allocationList, changes } = ctx
  const reasonEntry = masters.transferReasons.find(r => r.label === row.transferReason)

  if (reasonEntry?.noCheckRequired) {
    return allocationList.length > 0 ? runExclusivity(row, allocationList) : []
  }

  // RowRuleCtx: 呼び出し元（batchValidate）が渡した共有インスタンスを優先し、
  // 単行フォーム編集時は都度生成する（lazy getter のため C1/C2 の orgMasterByCode は
  // このコンテキスト内で 1 回だけビルドされる）
  const rowRuleCtx = ctx.rowRuleCtx ?? new RowRuleCtx(masters, orgs)

  const issues: ValidationIssue[] = [
    ...runAssertRequired(row, masters),               // A系: 必須チェック
    ...runBasedOnFormat(row),                         // B系: 書式チェック
    ...runFromFieldRules(row, orgs, masters),         // D2/F系: FIELD_RULES
    ...(allocationList.length > 0 ? runExclusivity(row, allocationList) : []),  // E系
    ...runGlobalConsistency(row, changes, allocationList, orgs),                 // G/W3系
  ]

  // ROW_RULES (C1〜C4, W2 など — state スコープのみ)
  for (const rule of ROW_RULES) {
    if (rule.scope !== 'state') continue
    if (rule.when && !rule.when(row, masters)) continue
    issues.push(...rule.validate(row, rowRuleCtx))
  }

  return issues
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
