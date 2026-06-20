// FIELD_CONSTRAINTS — フィールドの許容値制約の単一定義
//
// 以下の2箇所がここから導出される:
//   - validateExistence.ts (D2系) / validateRelated.ts (C系・条件付き)
//   - optionFilter/index.ts (選択肢生成・絞り込み)
//
// バリデーション追加・変更・オプション変更は必ずここを確認すること。

import type { AllocationRow } from './allocationRow'
import type { AllMasters } from './masters/aggregate'
import type { ValidationIssue } from './validation/types'
import type { FieldStrictness } from './optionStrictness'
import { resolveFieldStrictness } from './optionStrictness'
import { CONCURRENT_TYPES } from './masters/concurrentType'
import { UNION_MEMBER_CODE, UNION_MEMBER_CODES } from './masters/unionMember'
import { DISCRETIONARY_YES, DISCRETIONARY_NO } from './masters/discretionaryWork'

// code・label どちらで格納されていても照合できるルックアップ
export function findEmpType(ms: AllMasters, row: AllocationRow) {
  const v = row.employmentType as string | undefined
  if (!v) return undefined
  return ms.employmentTypes.find(e => e.label === v || e.code === v)
}

export function findTransferReason(ms: AllMasters, row: AllocationRow) {
  const v = row.transferReason as string | undefined
  if (!v) return undefined
  return ms.transferReasons.find(e => e.label === v || e.code === v)
}

// ── 型定義 ───────────────────────────────────────────────────────────────────

export type SuggestionRule = {
  kind:   'suggestion'           // 選択肢を表示するが、値の不一致はエラーにしない
  field:  keyof AllocationRow
  when?:  (row: AllocationRow, masters: AllMasters) => boolean
  source: (ms: AllMasters, row?: AllocationRow) => string[]
}

export type ConstraintRule = {
  kind:    'constraint'          // 選択肢を表示し、値がリスト外ならエラー
  field:   keyof AllocationRow
  when?:   (row: AllocationRow, masters: AllMasters) => boolean
  source:  (ms: AllMasters, row?: AllocationRow) => string[]
  message: (val: string) => string
}

export type ValueRule = SuggestionRule | ConstraintRule

// ── ルール定義 ───────────────────────────────────────────────────────────────

export const FIELD_CONSTRAINTS: ValueRule[] = [

  // ── 推奨値（選択肢あり・バリデーションなし）────────────────────────────────
  { kind: 'suggestion', field: 'transferReason',
    source: ms => ms.transferReasons.map(e => e.label) },

  { kind: 'suggestion', field: 'concurrentReason',
    source: ms => ms.concurrentReasons.map(e => e.label) },

  { kind: 'suggestion', field: 'demotionReason',
    source: ms => ms.demotionReasons.map(e => e.label) },

  { kind: 'suggestion', field: 'secondmentFromCompany',
    source: ms => ms.companies.map(e => e.label) },

  { kind: 'suggestion', field: 'secondmentToCompany',
    source: ms => ms.companies.map(e => e.label) },

  // ── 制約（条件なし）─────────────────────────────────────────────────────────
  { kind: 'constraint', field: 'officialPositionCode',
    source:  ms => ms.officialPositions.map(e => e.label),
    message: _  => '役職は有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'payGrade',
    source:  ms => ms.payGrades.map(e => e.label),
    message: _  => '給与等級は有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'location',
    source:  ms => ms.workLocations.map(e => e.label),
    message: _  => '勤務場所は有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'employmentType',
    source:  ms => ms.employmentTypes.map(e => e.label),
    message: _  => '雇用タイプは有効な選択肢から選択してください' },

  // 本務出向受入行: isSecondmentAcceptance の雇用タイプに限定
  { kind: 'constraint', field: 'employmentType',
    when:    (row) => !!row.secondmentFromCompany && row.concurrentType !== '兼務',
    source:  ms => ms.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    message: _  => '出向受入の雇用タイプは出向受入対応の雇用タイプから選択してください' },

{ kind: 'constraint', field: 'jobFamily',
    source:  ms => ms.jobFamilies.map(e => e.label),
    message: _  => 'ジョブファミリーは有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'positionBand',
    source:  ms => ms.jobLevels.map(e => e.label),
    message: _  => 'ポジション_バンドは有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'band',
    source:  ms => ms.jobLevels.map(e => e.label),
    message: _  => 'バンドは有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'unionFlag',
    source:  _  => [...UNION_MEMBER_CODES],
    message: _  => `労働組合員に無効な値が入力されています（${UNION_MEMBER_CODES.join('・')}のいずれかを選択してください）` },

  { kind: 'constraint', field: 'positionUnionFlag',
    source:  _  => [...UNION_MEMBER_CODES],
    message: _  => `ポジション_労働組合員に無効な値が入力されています（${UNION_MEMBER_CODES.join('・')}のいずれかを選択してください）` },

  { kind: 'constraint', field: 'trainingPositionFlag',
    source:  ms => ms.trainingPositions.map(e => e.code),
    message: _  => '業務研修ポジションは有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'positionDiscretionaryWorkFlag',
    source:  ms => ms.discretionaryWorkOptions.map(e => e.code),
    message: _  => 'ポジション_裁量労働区分は有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'discretionaryWorkFlag',
    source:  ms => ms.discretionaryWorkOptions.map(e => e.code),
    message: _  => '裁量労働区分は有効な選択肢から選択してください' },

  { kind: 'constraint', field: 'concurrentType',
    source:  _  => [...CONCURRENT_TYPES],
    message: _  => `本務兼務区分に無効な値が入力されています（${CONCURRENT_TYPES.join('・')}のいずれかを選択してください）` },

  // ── 制約（条件付き）─────────────────────────────────────────────────────────

  // C4: 出向先会社が設定されているとき、役職・勤務場所を出向者専用値に限定
  { kind: 'constraint', field: 'officialPositionCode',
    when:    row => !!row.secondmentToCompany,
    source:  _   => ['出向者'],
    message: _   => '出向先会社が入力されている場合、役職は「出向者」を選択してください' },

  { kind: 'constraint', field: 'location',
    when:    row => !!row.secondmentToCompany,
    source:  _   => ['出向'],
    message: _   => '出向先会社が入力されている場合、勤務場所は「出向」を選択してください' },

  // F1: 雇用タイプが出向受入のとき、対応バンド・給与等級に限定
  { kind: 'constraint', field: 'band',
    when:    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    source:  ms => ms.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    message: _   => 'バンドは雇用タイプに対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'payGrade',
    when:    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    source:  ms => ms.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    message: _   => '給与等級は雇用タイプに対応する選択肢から選択してください' },

  // F2: 雇用タイプが社員かつ userId === groupEmployeeId のとき、対応バンド・給与等級・ポジション_バンドに限定
  { kind: 'constraint', field: 'band',
    when:    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee
                       && !!row.userId && row.userId === row.groupEmployeeId,
    source:  ms => ms.jobLevels.filter(e => e.isRegularEmployee).map(e => e.label),
    message: _   => 'バンドは雇用タイプに対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'positionBand',
    when:    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee
                       && !!row.userId && row.userId === row.groupEmployeeId,
    source:  ms => ms.jobLevels.filter(e => e.isRegularEmployee).map(e => e.label),
    message: _   => 'ポジション_バンドは雇用タイプに対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'payGrade',
    when:    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee
                       && !!row.userId && row.userId === row.groupEmployeeId,
    source:  (ms, row) => {
      // ① isRegularEmployee フラグ
      // ② payGrade.band が、選択中バンドの promotionDemotionBand と一致
      // ③ payGrade.compensationCategory が、選択中 jobType の compensationCategory と一致
      const promotionBand = row?.band
        ? ms.jobLevels.find(e => e.label === (row.band as string))?.promotionDemotionBand
        : undefined
      const compensationCat = row?.jobType
        ? ms.jobTypes.find(e => e.label === (row.jobType as string))?.compensationCategory
        : undefined
      return ms.payGrades.filter(e => {
        if (!e.isRegularEmployee) return false
        if (promotionBand  && e.band                && e.band                !== promotionBand)  return false
        if (compensationCat && e.compensationCategory && e.compensationCategory !== compensationCat) return false
        return true
      }).map(e => e.label)
    },
    message: _   => '給与等級は雇用タイプに対応する選択肢から選択してください' },

  // F3: 雇用タイプが雇用延長のとき、対応バンド（JobClassification）・給与等級・ポジション_バンド（Position）に限定
  { kind: 'constraint', field: 'band',
    when:    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    source:  ms => ms.jobLevels.filter(e => e.isExtendedEmployeeJobClassification).map(e => e.label),
    message: _   => 'バンドは雇用タイプに対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'positionBand',
    when:    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    source:  ms => ms.jobLevels.filter(e => e.isExtendedEmployeePosition).map(e => e.label),
    message: _   => 'ポジション_バンドは雇用タイプに対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'payGrade',
    when:    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    source:  ms => ms.payGrades.filter(e => e.isExtendedEmployee).map(e => e.label),
    message: _   => '給与等級は雇用タイプに対応する選択肢から選択してください' },

  // F4: 申請区分の兼務チェックサインが立っているとき、給与等級を兼務対応に限定・休職フラグは設定不可
  { kind: 'constraint', field: 'payGrade',
    when:    (row, ms) => !!findTransferReason(ms, row)?.concurrentCheckSign,
    source:  ms => ms.payGrades.filter(e => e.isConcurrent).map(e => e.label),
    message: _   => '給与等級は兼務に対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'leaveOfAbsenceSign',
    when:    (row, ms) => !!findTransferReason(ms, row)?.concurrentCheckSign,
    source:  _   => ['0'],
    message: _   => '兼務の場合、休職フラグは設定できません' },

  // positionUnionFlag: F1/F2 — positionBand の isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
  { kind: 'constraint', field: 'positionUnionFlag',
    when:    (row, ms) => {
      const et = findEmpType(ms, row)
      return !!et?.isSecondmentAcceptance
          || (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
    },
    source:  (ms, row) => {
      const pos = ms.jobLevels.find(e => e.label === (row?.positionBand as string | undefined))
      return (pos && !pos.isRegularEmployeeOrSecondmentAcceptance)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    message: _ => 'ポジション_労働組合員は有効な選択肢から選択してください' },

  // positionUnionFlag: F3 — positionBand の isExtendedEmployeeUnionMember=false なら非組合員のみ
  { kind: 'constraint', field: 'positionUnionFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    source:  (ms, row) => {
      const pos = ms.jobLevels.find(e => e.label === (row?.positionBand as string | undefined))
      return (pos && !pos.isExtendedEmployeeUnionMember)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    message: _ => 'ポジション_労働組合員は有効な選択肢から選択してください' },

  // unionFlag: F1（出向受入）— 常に非組合員
  { kind: 'constraint', field: 'unionFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    source:  _   => [UNION_MEMBER_CODE.NON_MEMBER],
    message: _   => '労働組合員は有効な選択肢から選択してください' },

  // unionFlag: F2（社員）— band の isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
  { kind: 'constraint', field: 'unionFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee
                       && !!row.userId && row.userId === row.groupEmployeeId,
    source:  (ms, row) => {
      const band = ms.jobLevels.find(e => e.label === (row?.band as string | undefined))
      return (band && !band.isRegularEmployeeOrSecondmentAcceptance)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    message: _ => '労働組合員は有効な選択肢から選択してください' },

  // unionFlag: F3（雇用延長）— band の isExtendedEmployeeUnionMember=false なら非組合員のみ
  { kind: 'constraint', field: 'unionFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    source:  (ms, row) => {
      const band = ms.jobLevels.find(e => e.label === (row?.band as string | undefined))
      return (band && !band.isExtendedEmployeeUnionMember)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    message: _ => '労働組合員は有効な選択肢から選択してください' },

  // 裁量対象: ポジション_裁量労働対象が「はい」のとき、positionBand / jobFamily / jobType を裁量対象に絞る
  // positionBand: isDiscretionaryTarget 1=有効・0=除外・2=会社の noDiscretionaryVMAutoCreate に依存
  // jobFamily: 裁量対象 jobType を持つ親のみ
  // jobType: isDiscretionaryTarget=true の jobType のみ（jobFamily 選択中はさらに絞る）
  { kind: 'constraint', field: 'positionBand',
    when:    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    source:  (ms, row) => {
      const noAutoCreate = row ? getNoAutoCreate(row, ms) : false
      return ms.jobLevels.filter(e => {
        if (e.isDiscretionaryTarget === 1) return true
        if (e.isDiscretionaryTarget === 2) return !noAutoCreate
        return false
      }).map(e => e.label)
    },
    message: _ => 'ポジション_バンドは裁量対象に対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'jobFamily',
    when:    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    source:  ms => {
      const targetCodes = new Set(ms.jobTypes.filter(e => e.isDiscretionaryTarget).map(e => e.jobFamilyCode))
      return ms.jobFamilies.filter(e => targetCodes.has(e.code)).map(e => e.label)
    },
    message: _ => 'ジョブファミリーは裁量対象に対応する選択肢から選択してください' },

  { kind: 'constraint', field: 'jobType',
    when:    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    source:  (ms, row) => {
      const candidates = ms.jobTypes.filter(e => e.isDiscretionaryTarget)
      const parent = row?.jobFamily
        ? ms.jobFamilies.find(jf => jf.label === (row.jobFamily as string))
        : undefined
      if (parent) {
        const filtered = candidates.filter(s => s.jobFamilyCode === parent.code)
        return (filtered.length > 0 ? filtered : candidates).map(e => e.label)
      }
      return candidates.map(e => e.label)
    },
    message: _ => 'ジョブタイプは裁量対象に対応する選択肢から選択してください' },

  // ポジション_裁量労働対象 — F1（出向受入）: 役職・jobType・出向元会社のフラグがすべて有効なら「はい」を許可
  { kind: 'constraint', field: 'positionDiscretionaryWorkFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    source:  (ms, row) => {
      if (!row) return [DISCRETIONARY_YES, DISCRETIONARY_NO]
      const position  = ms.officialPositions.find(e => e.label === (row.officialPositionCode as string | undefined))
      if (position  && !position.isDiscretionaryTarget)  return [DISCRETIONARY_NO]
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      const company   = ms.companies.find(e => e.label === (row.secondmentFromCompany as string | undefined))
      if (company   && !company.isDiscretionaryTarget)   return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    message: _ => 'ポジション_裁量労働対象は有効な選択肢から選択してください' },

  // ポジション_裁量労働対象 — F2/F3（社員/雇用延長）: positionBand（会社ロジック）・jobType のフラグが有効なら「はい」を許可
  { kind: 'constraint', field: 'positionDiscretionaryWorkFlag',
    when:    (row, ms) => {
      const et = findEmpType(ms, row)
      return (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
          || !!et?.isExtendedEmployee
    },
    source:  (ms, row) => {
      if (!row) return [DISCRETIONARY_YES, DISCRETIONARY_NO]
      const posBand = ms.jobLevels.find(e => e.label === (row.positionBand as string | undefined))
      if (posBand) {
        const noAutoCreate = getNoAutoCreate(row, ms)
        const bandOk = posBand.isDiscretionaryTarget === 1
                    || (posBand.isDiscretionaryTarget === 2 && !noAutoCreate)
        if (!bandOk) return [DISCRETIONARY_NO]
      }
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    message: _ => 'ポジション_裁量労働対象は有効な選択肢から選択してください' },

  // 裁量労働対象（人）— F1（出向受入）: 役職・jobType・出向元会社のフラグがすべて有効なら「はい」を許可
  { kind: 'constraint', field: 'discretionaryWorkFlag',
    when:    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    source:  (ms, row) => {
      if (!row) return [DISCRETIONARY_YES, DISCRETIONARY_NO]
      const position  = ms.officialPositions.find(e => e.label === (row.officialPositionCode as string | undefined))
      if (position  && !position.isDiscretionaryTarget)  return [DISCRETIONARY_NO]
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      const company   = ms.companies.find(e => e.label === (row.secondmentFromCompany as string | undefined))
      if (company   && !company.isDiscretionaryTarget)   return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    message: _ => '裁量労働対象は有効な選択肢から選択してください' },

  // 裁量労働対象（人）— F2/F3（社員/雇用延長）: バンド（会社ロジック考慮）・jobType のフラグが有効なら「はい」を許可
  { kind: 'constraint', field: 'discretionaryWorkFlag',
    when:    (row, ms) => {
      const et = findEmpType(ms, row)
      return (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
          || !!et?.isExtendedEmployee
    },
    source:  (ms, row) => {
      if (!row) return [DISCRETIONARY_YES, DISCRETIONARY_NO]
      const band = ms.jobLevels.find(e => e.label === (row.band as string | undefined))
      if (band) {
        const noAutoCreate = getNoAutoCreate(row, ms)
        const bandOk = band.isDiscretionaryTarget === 1
                    || (band.isDiscretionaryTarget === 2 && !noAutoCreate)
        if (!bandOk) return [DISCRETIONARY_NO]
      }
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    message: _ => '裁量労働対象は有効な選択肢から選択してください' },
]

// ── 内部ヘルパー ─────────────────────────────────────────────────────────────

// 行の組織コードから会社コードを引き、CompanyFilterEntry の noDiscretionaryVMAutoCreate を返す。
// 会社コードが未設定、またはマスタ未ロード時は false（= isDiscretionaryTarget=2 を有効扱い）。
function getNoAutoCreate(row: AllocationRow, ms: AllMasters): boolean {
  const org = ms.orgMasterEntries.find(e => e.code === row.departmentCode && e.phase === 'after')
           ?? ms.orgMasterEntries.find(e => e.code === row.departmentCode)
  if (!org?.companyCode) return false
  return ms.companyFilters.find(f => f.code === org.companyCode)?.noDiscretionaryVMAutoCreate ?? false
}

// ── 評価ヘルパー ─────────────────────────────────────────────────────────────

/**
 * 制約ルールを評価し、違反があれば ValidationIssue を返す。
 * - source が空（マスタ未ロード）はスキップ
 * - 空値は A系必須チェックに委ねてここではスキップ
 * - when が false なら空を返す
 */
export function evaluateConstraint(
  rule:       ConstraintRule,
  row:        AllocationRow,
  masters:  AllMasters,
  overrides?: Partial<Record<string, FieldStrictness>>,
): ValidationIssue[] {
  if (rule.when && !rule.when(row, masters)) return []
  const allowed = rule.source(masters, row)
  if (allowed.length === 0) return []
  const val = row[rule.field] as string | undefined
  if (!val) return []
  if (allowed.includes(val)) return []

  const strictness = resolveFieldStrictness(String(rule.field), overrides ?? {})
  if (strictness !== 'strict') return []
  return [{ field: rule.field, level: 'error', message: rule.message(val) }]
}

/**
 * フィールドに適用される有効な source を返す。
 * 条件ルール（when あり）が一般ルール（when なし）より優先される。
 * 該当ルールがなければ null。
 */
export function getEffectiveSource(
  field:     keyof AllocationRow,
  row:       AllocationRow,
  masters: AllMasters,
): string[] | null {
  const conditional = FIELD_CONSTRAINTS.find(r => r.field === field && r.when?.(row, masters))
  if (conditional) return conditional.source(masters, row)
  const general = FIELD_CONSTRAINTS.find(r => r.field === field && !r.when)
  return general ? general.source(masters, row) : null
}
