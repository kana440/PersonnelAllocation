import type { AllocationRow } from '../allocationRow'
import type { Organization } from '../schemas'
import type { AllCodeLists } from '../codeLists/aggregate'
import { VALUE_RULES, evaluateConstraint, type ConstraintRule } from '../valueRules'
import type { FieldStrictness } from '../optionStrictness'
import type { ValidationIssue } from './types'

type Overrides = Partial<Record<string, FieldStrictness>>

// D2系: マスタ・リスト値との存在チェック
// 大半は VALUE_RULES から導出。例外は以下のカスタムチェック:
//   D2-1: departmentCode — Organization[] 参照が必要
//   D2-7: jobType        — 親子フィルタ（jobFamily 依存）

// ── D2-1: 組織コード（カスタム: orgs 参照）──────────────────────────────────
function checkD2_1(row: AllocationRow, orgs: Organization[]): ValidationIssue[] {
  const code = row.departmentCode
  if (!code || orgs.length === 0) return []
  if (orgs.some(o => o.externalCode === code || o.id === code)) return []
  return [{ field: 'departmentCode', level: 'error', message: '組織コードは有効な選択肢から選択してください' }]
}

// ── D2-7: ジョブタイプ（カスタム: 親子フィルタ）─────────────────────────────
function checkD2_7(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const jobType = row.jobType
  if (!jobType || codeLists.jobTypes.length === 0) return []
  const parent = codeLists.jobFamilies.find(jf => jf.label === row.jobFamily)
  if (parent) {
    const children = codeLists.jobTypes.filter(s => s.jobFamilyCode === parent.code)
    if (children.some(s => s.label === jobType)) return []
    return [{ field: 'jobType', level: 'error', message: 'ジョブタイプは選択中のジョブファミリーに含まれる値を選択してください' }]
  }
  if (codeLists.jobTypes.some(s => s.label === jobType)) return []
  return [{ field: 'jobType', level: 'error', message: 'ジョブタイプは有効な選択肢から選択してください' }]
}

// ── D2-2〜D2-6, D2-8〜D2-11: VALUE_RULES から導出 ──────────────────────────
const EXISTENCE_RULES = VALUE_RULES.filter(
  (r): r is ConstraintRule => r.kind === 'constraint' && !r.when
)

function checkFromValueRules(row: AllocationRow, codeLists: AllCodeLists, overrides?: Overrides): ValidationIssue[] {
  return EXISTENCE_RULES.flatMap(r => evaluateConstraint(r, row, codeLists, overrides))
}

export function runExistence(
  row:       AllocationRow,
  orgs:      Organization[],
  codeLists: AllCodeLists,
  overrides?: Overrides,
): ValidationIssue[] {
  return [
    ...checkD2_1(row, orgs),
    ...checkFromValueRules(row, codeLists, overrides),
    ...checkD2_7(row, codeLists),
  ]
}
