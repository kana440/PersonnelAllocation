import type { AllocationRow }  from '../../allocationRow'
import type { Organization }   from '../../schemas'
import type { AllMasters }     from '../../masters/aggregate'
import { FIELD_RULES, evaluateFieldRule } from '../field'
import type { ValidationIssue } from './types'

/**
 * FIELD_RULES ベースのバリデーション（D2系 + F系）を一括評価する。
 *
 * D2系（when なし）: マスタ・リスト値との存在チェック
 * F系 （when あり）: 雇用タイプ・申請区分による条件付き値制約
 *
 * 以下の 2 件はカスタムロジックが必要なため FIELD_RULES 外で実装する:
 *   D2-1: departmentCode — Organization[] による存在チェック
 *   D2-7: jobType        — jobFamily 親子フィルタ
 */

// ── D2-1: 組織コード ──────────────────────────────────────────────────────────
function checkD2_1(row: AllocationRow, orgs: Organization[]): ValidationIssue[] {
  const code = row.departmentCode
  if (!code || orgs.length === 0) return []
  if (orgs.some(o => o.externalCode === code || o.id === code)) return []
  return [{ field: 'departmentCode', level: 'error', message: '組織コードは有効な選択肢から選択してください', id: 'consistency_dept_options' }]
}

// ── D2-7: ジョブタイプ（親子フィルタ）────────────────────────────────────────
function checkD2_7(row: AllocationRow, masters: AllMasters): ValidationIssue[] {
  const jobType = row.jobType
  if (!jobType || masters.jobTypes.length === 0) return []
  const parent = masters.jobFamilies.find(jf => jf.label === row.jobFamily)
  if (parent) {
    const children = masters.jobTypes.filter(s => s.jobFamilyCode === parent.code)
    if (children.some(s => s.label === jobType)) return []
    return [{ field: 'jobType', level: 'error', message: 'ジョブタイプは選択中のジョブファミリーに含まれる値を選択してください', id: 'consistency_job_type' }]
  }
  if (masters.jobTypes.some(s => s.label === jobType)) return []
  return [{ field: 'jobType', level: 'error', message: 'ジョブタイプは有効な選択肢から選択してください', id: 'consistency_job_type' }]
}

// ── FIELD_RULES 全評価（D2-2〜D2-6, D2-8〜D2-11, F系）─────────────────────────
const VALIDATING_RULES = FIELD_RULES.filter(r => r.validation !== 'none')

export function runFromFieldRules(
  row:     AllocationRow,
  orgs:    Organization[],
  masters: AllMasters,
): ValidationIssue[] {
  return [
    ...checkD2_1(row, orgs),
    ...VALIDATING_RULES.flatMap(r =>
      evaluateFieldRule(r, row, masters).map(issue => ({
        ...issue,
        id: r.when ? 'field_constraint_conditional' : 'field_constraint',
      }))
    ),
    ...checkD2_7(row, masters),
  ]
}
