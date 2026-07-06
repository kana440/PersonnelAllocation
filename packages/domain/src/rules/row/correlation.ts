/**
 * row/correlation.ts — C系: フィールド間相関チェック (RowRule 実装)
 *
 * ctx.orgMasterByCode（Map、O(1)）を使うことで、
 * 旧実装の orgMasterEntries.find()（O(N) per row）を解消。
 */

import type { AllocationRow }   from '../../allocationRow'
import type { OrgMasterEntry }  from '../../masters/orgMaster'
import type { RowRule, RowRuleCtx } from '../rowRule'
import type { ValidationIssue }  from '../validate/types'
import { UNION_MEMBER_CODE }    from '../../masters/unionMember'
import { FIELD_DISPLAY_LABELS } from '../../csvImport/allocationList/labels'

// ── C1: 組織サブフィールドがマスタ値と一致するか ────────────────────────────

type OrgSubField = {
  rowKey:    keyof AllocationRow
  masterKey: keyof OrgMasterEntry
  label:     string
}

const ORG_SUB_FIELDS: OrgSubField[] = [
  { rowKey: 'businessUnit', masterKey: 'pathBusinessUnit', label: FIELD_DISPLAY_LABELS['businessUnit'] ?? '関係部門' },
  { rowKey: 'division',     masterKey: 'pathDivision',     label: FIELD_DISPLAY_LABELS['division']     ?? '部門'    },
  { rowKey: 'subDivision',  masterKey: 'pathDepartment',   label: FIELD_DISPLAY_LABELS['subDivision']  ?? '統括部'  },
  { rowKey: 'group',        masterKey: 'pathGroup',        label: FIELD_DISPLAY_LABELS['group']        ?? 'グループ'},
  { rowKey: 'team',         masterKey: 'pathTeam',         label: FIELD_DISPLAY_LABELS['team']         ?? 'チーム'  },
]

const c1: RowRule = {
  id:    'C1-orgSubFields',
  scope: 'state',
  when: (row, masters) => !!row.departmentCode && masters.orgMasterEntries.length > 0,
  validate(row: AllocationRow, ctx: RowRuleCtx): ValidationIssue[] {
    const entry = ctx.orgMasterByCode.get(row.departmentCode as string)
    if (!entry) return []

    const issues: ValidationIssue[] = []
    for (const { rowKey, masterKey, label } of ORG_SUB_FIELDS) {
      const rowVal    = (row[rowKey]      as string | undefined) ?? ''
      const masterVal = (entry[masterKey] as string)             ?? ''
      if (rowVal !== masterVal)
        issues.push({ field: rowKey, level: 'error', id: 'consistency_org_sub',
          message: `${label}が組織マスタの値と異なります（正しい値: "${masterVal || '（空）'}"）` })
    }
    return issues
  },
}

// ── C2: 勤務場所・コストセンターがマスタと一致するか ─────────────────────────

const c2: RowRule = {
  id:    'C2-locationCostCenter',
  scope: 'state',
  when: (row, masters) => !!row.departmentCode && masters.orgMasterEntries.length > 0,
  validate(row: AllocationRow, ctx: RowRuleCtx): ValidationIssue[] {
    const entry = ctx.orgMasterByCode.get(row.departmentCode as string)
    if (!entry) return []

    const issues: ValidationIssue[] = []
    if (entry.workLocation && (row.location as string | undefined) !== entry.workLocation)
      issues.push({ field: 'location',   level: 'error', id: 'consistency_location_cc',
        message: `勤務場所が組織マスタの値と異なります（正しい値: "${entry.workLocation}"）` })
    if (entry.costCenter && (row.costCenter as string | undefined) !== entry.costCenter)
      issues.push({ field: 'costCenter', level: 'error', id: 'consistency_location_cc',
        message: `コストセンターが組織マスタの値と異なります（正しい値: "${entry.costCenter}"）` })
    return issues
  },
}

// ── C3: 非組合協定フラグ → 組合員フラグは非組合員のみ ────────────────────────

const c3: RowRule = {
  id:    'C3-nonUnionAgreement',
  scope: 'state',
  when: (row) => row.nonUnionAgreementFlag === '1',
  validate(row: AllocationRow, _ctx: RowRuleCtx): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (row.positionUnionFlag !== UNION_MEMBER_CODE.NON_MEMBER)
      issues.push({ field: 'positionUnionFlag', level: 'error', id: 'consistency_union',
        message: '非組合協定対象者の場合、ポジション＿労働組合員は「非組合員」を選択してください' })
    if (row.unionFlag !== UNION_MEMBER_CODE.NON_MEMBER)
      issues.push({ field: 'unionFlag', level: 'error', id: 'consistency_union',
        message: '非組合協定対象者の場合、労働組合員は「非組合員」を選択してください' })
    return issues
  },
}

// ── C4: 出向先会社設定時に departmentCode は出向者用組織 ──────────────────────

const SECONDMENT_ORG_LEVEL = '出向者用組織'

const c4: RowRule = {
  id:    'C4-secondmentOrgCheck',
  scope: 'state',
  when: (row) => !!row.secondmentToCompany && !!row.departmentCode,
  validate(row: AllocationRow, ctx: RowRuleCtx): ValidationIssue[] {
    const org = ctx.orgMasterByCode.get(row.departmentCode as string)
    if (org && org.orgCategory !== SECONDMENT_ORG_LEVEL)
      return [{ field: 'departmentCode', level: 'error', id: 'consistency_secondment_org',
        message: '出向先会社が入力されている場合、組織コードは出向者用組織を選択してください' }]
    return []
  },
}

export const CORRELATION_RULES: RowRule[] = [c1, c2, c3, c4]
