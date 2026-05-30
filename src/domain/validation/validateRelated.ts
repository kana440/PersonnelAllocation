import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { OrgMasterEntry } from '../codeLists/orgMaster'
import { UNION_MEMBER_CODE } from '../codeLists/unionMember'
import { VALUE_RULES, evaluateConstraint, type ConstraintRule } from '../valueRules'
import type { ValidationIssue } from './types'

// C系: 関連チェック（マスタ参照による整合性チェック）
// C1/C2/C3 はカスタムロジック。
// C4（条件付き値制約）は VALUE_RULES から導出。

type OrgSubField = {
  rowKey:    keyof AllocationRow
  masterKey: keyof OrgMasterEntry
  label:     string
}

const ORG_SUB_FIELDS: OrgSubField[] = [
  { rowKey: 'businessUnit', masterKey: 'businessUnit', label: 'ビジネスユニット' },
  { rowKey: 'division',     masterKey: 'division',     label: '部門'           },
  { rowKey: 'subDivision',  masterKey: 'department',   label: '統括部'         },
  { rowKey: 'group',        masterKey: 'group',        label: 'グループ'       },
  { rowKey: 'team',         masterKey: 'team',         label: 'チーム'         },
]

/**
 * C1: 組織コードがマスタに存在する場合、BU/部門/統括部/グループ/チームがマスタ値と一致するか検証。
 * 自動導出が働いた場合は一致するが、直接変更で不整合が生じた場合を検出する。
 * マスタ未ロード時（orgMasterEntries が空）はスキップ。
 */
function checkC1(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.departmentCode) return []
  if (codeLists.orgMasterEntries.length === 0) return []

  const entry = codeLists.orgMasterEntries.find(e => e.code === row.departmentCode && e.phase === 'after')
             ?? codeLists.orgMasterEntries.find(e => e.code === row.departmentCode)
  if (!entry) return []

  const issues: ValidationIssue[] = []
  for (const { rowKey, masterKey, label } of ORG_SUB_FIELDS) {
    const rowVal    = (row[rowKey]      as string | undefined) ?? ''
    const masterVal = (entry[masterKey] as string)             ?? ''
    if (rowVal !== masterVal)
      issues.push({ field: rowKey, level: 'error',
        message: `${label}が組織マスタの値と異なります（正しい値: "${masterVal || '（空）'}"）` })
  }
  return issues
}

/**
 * C2: C1 の派生。勤務場所・コストセンターをマスタと照合する。
 * マスタ側が未入力のフィールドはスキップ。
 */
function checkC2(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.departmentCode) return []
  if (codeLists.orgMasterEntries.length === 0) return []

  const entry = codeLists.orgMasterEntries.find(e => e.code === row.departmentCode && e.phase === 'after')
             ?? codeLists.orgMasterEntries.find(e => e.code === row.departmentCode)
  if (!entry) return []

  const issues: ValidationIssue[] = []
  if (entry.workLocation && (row.location as string | undefined) !== entry.workLocation)
    issues.push({ field: 'location',    level: 'error', message: `勤務場所が組織マスタの値と異なります（正しい値: "${entry.workLocation}"）` })
  if (entry.CostCenter && (row.costCenter as string | undefined) !== entry.CostCenter)
    issues.push({ field: 'costCenter',  level: 'error', message: `コストセンターが組織マスタの値と異なります（正しい値: "${entry.CostCenter}"）` })
  return issues
}

/**
 * C3: nonUnionAgreementFlag が '1' の場合、ポジション＿労働組合員・労働組合員は非組合員でなければならない。
 */
function checkC3(row: AllocationRow): ValidationIssue[] {
  if (row.nonUnionAgreementFlag !== '1') return []
  const issues: ValidationIssue[] = []
  if (row.positionUnionFlag !== UNION_MEMBER_CODE.NON_MEMBER)
    issues.push({ field: 'positionUnionFlag', level: 'error',
      message: '非組合協定対象者の場合、ポジション＿労働組合員は「非組合員」を選択してください' })
  if (row.unionFlag !== UNION_MEMBER_CODE.NON_MEMBER)
    issues.push({ field: 'unionFlag', level: 'error',
      message: '非組合協定対象者の場合、労働組合員は「非組合員」を選択してください' })
  return issues
}

// ── C4: 条件付き値制約 — VALUE_RULES から導出 ────────────────────────────────
// departmentCode の組織レベルチェックのみカスタム（orgs ではなく orgMasterEntries を使用）
const SECONDMENT_ORG_LEVEL = '出向者用組織'

const CONDITIONAL_CONSTRAINT_RULES = VALUE_RULES.filter(
  (r): r is ConstraintRule => r.kind === 'constraint' && !!r.when
)

// C4: 出向先会社設定時の組織コードチェック（カスタム部分のみ）
function checkC4(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.secondmentToCompany) return []
  if (!row.departmentCode) return []

  const org = codeLists.orgMasterEntries.find(e => e.code === row.departmentCode && e.phase === 'after')
           ?? codeLists.orgMasterEntries.find(e => e.code === row.departmentCode)
  if (org && org.organizationLevel !== SECONDMENT_ORG_LEVEL)
    return [{ field: 'departmentCode', level: 'error',
      message: '出向先会社が入力されている場合、組織コードは出向者用組織を選択してください' }]
  return []
}

// VALUE_RULES の条件付き制約をすべて評価（C4の役職・勤務場所、F1〜F4のバンド・給与等級など）
function checkConditionalValueRules(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  return CONDITIONAL_CONSTRAINT_RULES.flatMap(r => evaluateConstraint(r, row, codeLists))
}

export function runRelated(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  return [
    ...checkC1(row, codeLists),
    ...checkC2(row, codeLists),
    ...checkC3(row),
    ...checkC4(row, codeLists),
    ...checkConditionalValueRules(row, codeLists),
  ]
}
