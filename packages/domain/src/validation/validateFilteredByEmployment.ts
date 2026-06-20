import type { AllocationRow } from '../allocationRow'
import type { AllMasters } from '../masters/aggregate'
import { FIELD_CONSTRAINTS, evaluateConstraint, type ConstraintRule } from '../fieldConstraints'
import type { FieldStrictness } from '../optionStrictness'
import type { ValidationIssue } from './types'

// F系: 雇用タイプ・申請区分による値制約（FIELD_CONSTRAINTS の条件付き constraint から自動評価）

type Overrides = Partial<Record<string, FieldStrictness>>

const CONDITIONAL_CONSTRAINT_RULES = FIELD_CONSTRAINTS.filter(
  (r): r is ConstraintRule => r.kind === 'constraint' && !!r.when
)

export function runFilteredByEmployment(row: AllocationRow, masters: AllMasters, overrides?: Overrides): ValidationIssue[] {
  return CONDITIONAL_CONSTRAINT_RULES.flatMap(r => evaluateConstraint(r, row, masters, overrides))
}
