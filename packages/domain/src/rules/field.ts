/**
 * fieldRules.ts — フィールドの振る舞い定義（ドメインの単一真実）
 *
 * FieldRule が3つの軸を1つのルールで宣言する:
 *   validation → バリデーション  (resolveRow Phase 2 で評価)
 *   options    → 選択肢表示     (resolveRow Phase 3 で使用)
 *   value      → 自動導出       (resolveRow Phase 1 で適用: source() が1件ならフィールドを自動セット)
 *
 * FIELD_RULES を読めば「このフィールドはどう振る舞うか」が1か所で分かる。
 *
 * State 制約: when なし / 現在値のみ参照 → 常に適用
 * Action 制約: when で row.prevXxx を参照 → 特定操作文脈（昇降格等）でのみ適用
 *
 * Profile: resolveRow に渡す場面固有の上書き（stepMode 等 UI 動的状態）
 */

import type { AllocationRow } from '../allocationRow'
import type { AllMasters }    from '../masters/aggregate'
import type { ValidationIssue } from './validate/types'
import { CONCURRENT_TYPES }                   from '../masters/concurrentType'
import { UNION_MEMBER_CODE, UNION_MEMBER_CODES } from '../masters/unionMember'
import { DISCRETIONARY_YES, DISCRETIONARY_NO }   from '../masters/discretionaryWork'

// ── 型定義 ──────────────────────────────────────────────────────────────────

/**
 * フィールドの振る舞いを3軸で宣言する統合型。
 *
 * source() が返す「有効値リスト」を単一の真実として:
 *   value:      source() が1件のとき自動セット(auto) / 候補提示のみ(suggest) / なし(none)
 *   options:    有効のみ表示(filter) / 有効を上・無効を下(split) / 非表示(none)
 *   validation: リスト外をエラー(error) / 警告(warning) / チェックなし(none)
 *
 * when() に row.prevXxx を参照することで Action 制約（操作文脈）も同じ型で表現できる。
 */
export interface FieldRule {
  field:      keyof AllocationRow
  issueId?:   string            // ValidationIssue.id に使う個別ID。未指定は fromFieldRules.ts でフォールバック
  when?:      (row: AllocationRow, masters: AllMasters) => boolean
  source:     (masters: AllMasters, row: AllocationRow) => string[]
  value:      'auto' | 'suggest' | 'none'
  options:    'filter' | 'split' | 'none'
  validation: 'error' | 'warning' | 'none'
  message?:   (val: string) => string   // validation が 'error'|'warning' のとき必要
}

// ── Profile 型（resolveRow に渡す場面固有の上書き）──────────────────────────

/** resolveRow に渡す場面固有のオーバーライド（keyed by フィールド名） */
export type Profile = Partial<Record<string, ProfileEntry>>

/**
 * FieldRule の1軸以上をオーバーライドする。
 * stepMode 等 UI 動的状態を表現するために resolveRow の呼び出し側が構築する。
 * source の引数順は FieldRule.source と同じ (masters, row)。
 */
export interface ProfileEntry {
  source?:     (masters: AllMasters, row: AllocationRow) => string[]
  value?:      FieldRule['value']
  options?:    FieldRule['options']
  validation?: FieldRule['validation']
}

// ── ルックアップヘルパー ─────────────────────────────────────────────────────

/** code・label どちらで格納されていても照合できるルックアップ */
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

// 行の組織コードから会社コードを引き、CompanyFilterEntry の noDiscretionaryVMAutoCreate を返す。
// departmentCode → noAutoCreate の解決結果を ms 単位でキャッシュする（大量行のバリデーションで
// orgMasterEntries/companyFilters を毎行 O(N) 走査しないため。ms の参照が変わるまで再利用可能）。
const noAutoCreateCache = new WeakMap<AllMasters, Map<string, boolean>>()

function buildNoAutoCreateMap(ms: AllMasters): Map<string, boolean> {
  // 元ロジック（1件ずつ find）と同じ優先順位を保つ: 同一 code なら phase='after' の
  // 最初の1件を優先し、なければ phase を問わない最初の1件にフォールバックする。
  const afterEntryByCode = new Map<string, typeof ms.orgMasterEntries[number]>()
  const anyEntryByCode   = new Map<string, typeof ms.orgMasterEntries[number]>()
  for (const e of ms.orgMasterEntries) {
    if (e.phase === 'after' && !afterEntryByCode.has(e.code)) afterEntryByCode.set(e.code, e)
    if (!anyEntryByCode.has(e.code)) anyEntryByCode.set(e.code, e)
  }
  const noAutoCreateByCompanyCode = new Map(ms.companyFilters.map(f => [f.code, f.noDiscretionaryVMAutoCreate ?? false]))
  const result = new Map<string, boolean>()
  const codes = new Set<string>([...afterEntryByCode.keys(), ...anyEntryByCode.keys()])
  for (const code of codes) {
    const org = afterEntryByCode.get(code) ?? anyEntryByCode.get(code)
    result.set(code, org?.companyCode ? (noAutoCreateByCompanyCode.get(org.companyCode) ?? false) : false)
  }
  return result
}

function getNoAutoCreate(row: AllocationRow, ms: AllMasters): boolean {
  const code = row.departmentCode
  if (!code) return false
  let map = noAutoCreateCache.get(ms)
  if (!map) {
    map = buildNoAutoCreateMap(ms)
    noAutoCreateCache.set(ms, map)
  }
  return map.get(code) ?? false
}

// ── ルール定義 ───────────────────────────────────────────────────────────────

// State 制約（バリデーション警告・選択肢分割表示）の簡略コンストラクタ
// State 制約は 'warning' — セーブをブロックせず業務ルール違反を知らせる。
// Action 制約（EditOperation.constraints）が 'error' を使う。
function c(
  field:   keyof AllocationRow,
  source:  FieldRule['source'],
  message: (val: string) => string,
  when?:   FieldRule['when'],
  issueId?: string,
): FieldRule {
  return { field, source, when, issueId, value: 'none', options: 'split', validation: 'warning', message }
}

// 推奨ルール（バリデーションなし・選択肢のみ）の簡略コンストラクタ
function s(
  field:  keyof AllocationRow,
  source: FieldRule['source'],
  when?:  FieldRule['when'],
): FieldRule {
  return { field, source, when, value: 'none', options: 'split', validation: 'none' }
}

export const FIELD_RULES: FieldRule[] = [

  // ── 推奨値（選択肢あり・バリデーションなし）────────────────────────────────
  s('transferReason',      ms => ms.transferReasons.map(e => e.label)),
  s('concurrentReason',    ms => ms.concurrentReasons.map(e => e.label)),
  s('demotionReason',      ms => ms.demotionReasons.map(e => e.label)),
  s('secondmentFromCompany', ms => ms.companies.map(e => e.label)),
  s('secondmentToCompany',   ms => ms.companies.map(e => e.label)),

  // ── 制約（条件なし）─────────────────────────────────────────────────────────
  c('officialPositionCode',
    ms => ms.officialPositions.map(e => e.label),
    _  => '役職は有効な選択肢から選択してください'),

  c('payGrade',
    ms => ms.payGrades.map(e => e.label),
    _  => '給与等級は有効な選択肢から選択してください'),

  c('location',
    ms => ms.workLocations.map(e => e.label),
    _  => '勤務場所は有効な選択肢から選択してください'),

  c('employmentType',
    ms => ms.employmentTypes.map(e => e.label),
    _  => '雇用タイプは有効な選択肢から選択してください'),

  // 本務出向受入行: isSecondmentAcceptance の雇用タイプに限定
  c('employmentType',
    ms => ms.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    _  => '出向受入の雇用タイプは出向受入対応の雇用タイプから選択してください',
    row => !!row.secondmentFromCompany && row.concurrentType !== '兼務',
    'f1_employmentType'),

  c('jobFamily',
    ms => ms.jobFamilies.map(e => e.label),
    _  => 'ジョブファミリーは有効な選択肢から選択してください'),

  c('positionBand',
    ms => ms.jobLevels.map(e => e.label),
    _  => 'ポジション_バンドは有効な選択肢から選択してください'),

  c('band',
    ms => ms.jobLevels.map(e => e.label),
    _  => 'バンドは有効な選択肢から選択してください'),

  c('unionFlag',
    _  => [...UNION_MEMBER_CODES],
    _  => `労働組合員に無効な値が入力されています（${UNION_MEMBER_CODES.join('・')}のいずれかを選択してください）`),

  c('positionUnionFlag',
    _  => [...UNION_MEMBER_CODES],
    _  => `ポジション_労働組合員に無効な値が入力されています（${UNION_MEMBER_CODES.join('・')}のいずれかを選択してください）`),

  c('trainingPositionFlag',
    ms => ms.trainingPositions.map(e => e.code),
    _  => '業務研修ポジションは有効な選択肢から選択してください'),

  c('positionDiscretionaryWorkFlag',
    ms => ms.discretionaryWorkOptions.map(e => e.code),
    _  => 'ポジション_裁量労働区分は有効な選択肢から選択してください'),

  c('discretionaryWorkFlag',
    ms => ms.discretionaryWorkOptions.map(e => e.code),
    _  => '裁量労働区分は有効な選択肢から選択してください'),

  c('concurrentType',
    _  => [...CONCURRENT_TYPES],
    _  => `本務兼務区分に無効な値が入力されています（${CONCURRENT_TYPES.join('・')}のいずれかを選択してください）`),

  // ── 制約（条件付き）─────────────────────────────────────────────────────────

  // C4: 出向先会社が設定されているとき、役職・勤務場所を出向者専用値に限定
  c('officialPositionCode',
    _   => ['出向者'],
    _   => '出向先会社が入力されている場合、役職は「出向者」を選択してください',
    row => !!row.secondmentToCompany,
    'c4_officialPosition'),

  c('location',
    _   => ['出向'],
    _   => '出向先会社が入力されている場合、勤務場所は「出向」を選択してください',
    row => !!row.secondmentToCompany,
    'c4_location'),

  // F1: 雇用タイプが出向受入のとき、対応バンド・給与等級に限定
  c('band',
    ms => ms.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    _  => 'バンドは雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    'f1_band'),

  c('payGrade',
    ms => ms.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label),
    _  => '給与等級は雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    'f1_payGrade'),

  // F2: 雇用タイプが社員かつ userId === groupEmployeeId のとき、対応バンド・給与等級・ポジション_バンドに限定
  c('band',
    ms => ms.jobLevels.filter(e => e.isRegularEmployee).map(e => e.label),
    _  => 'バンドは雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId,
    'f2_band'),

  c('positionBand',
    ms => ms.jobLevels.filter(e => e.isRegularEmployee).map(e => e.label),
    _  => 'ポジション_バンドは雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId,
    'f2_positionBand'),

  c('payGrade',
    (ms, row) => {
      // ① isRegularEmployee フラグ
      // ② payGrade.band が、選択中バンドの promotionDemotionBand と一致
      // ③ payGrade.compensationCategory が、選択中 jobType の compensationCategory と一致
      const promotionBand = row.band
        ? ms.jobLevels.find(e => e.label === (row.band as string))?.promotionDemotionBand
        : undefined
      const compensationCat = row.jobType
        ? ms.jobTypes.find(e => e.label === (row.jobType as string))?.compensationCategory
        : undefined
      return ms.payGrades.filter(e => {
        if (!e.isRegularEmployee) return false
        if (promotionBand    && e.band                 && e.band                 !== promotionBand)    return false
        if (compensationCat  && e.compensationCategory && e.compensationCategory !== compensationCat)  return false
        return true
      }).map(e => e.label)
    },
    _  => '給与等級は雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId,
    'f2_payGrade'),

  // F3: 雇用タイプが雇用延長のとき、対応バンド・給与等級・ポジション_バンドに限定
  c('band',
    ms => ms.jobLevels.filter(e => e.isExtendedEmployeeJobClassification).map(e => e.label),
    _  => 'バンドは雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    'f3_band'),

  c('positionBand',
    ms => ms.jobLevels.filter(e => e.isExtendedEmployeePosition).map(e => e.label),
    _  => 'ポジション_バンドは雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    'f3_positionBand'),

  c('payGrade',
    ms => ms.payGrades.filter(e => e.isExtendedEmployee).map(e => e.label),
    _  => '給与等級は雇用タイプに対応する選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    'f3_payGrade'),

  // F4: 申請区分の兼務チェックサインが立っているとき、給与等級を兼務対応に限定・休職フラグは設定不可
  c('payGrade',
    ms => ms.payGrades.filter(e => e.isConcurrent).map(e => e.label),
    _  => '給与等級は兼務に対応する選択肢から選択してください',
    (row, ms) => !!findTransferReason(ms, row)?.concurrentCheckSign,
    'f4_payGrade'),

  c('leaveOfAbsenceSign',
    _  => ['0'],
    _  => '兼務の場合、休職フラグは設定できません',
    (row, ms) => !!findTransferReason(ms, row)?.concurrentCheckSign,
    'f4_leaveOfAbsence'),

  // positionUnionFlag: F1/F2 — positionBand の isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
  c('positionUnionFlag',
    (ms, row) => {
      const pos = ms.jobLevels.find(e => e.label === (row.positionBand as string | undefined))
      return (pos && !pos.isRegularEmployeeOrSecondmentAcceptance)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    _ => 'ポジション_労働組合員は有効な選択肢から選択してください',
    (row, ms) => {
      const et = findEmpType(ms, row)
      return !!et?.isSecondmentAcceptance
          || (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
    },
    'f_posUnionFlag_f1f2'),

  // positionUnionFlag: F3 — positionBand の isExtendedEmployeeUnionMember=false なら非組合員のみ
  c('positionUnionFlag',
    (ms, row) => {
      const pos = ms.jobLevels.find(e => e.label === (row.positionBand as string | undefined))
      return (pos && !pos.isExtendedEmployeeUnionMember)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    _ => 'ポジション_労働組合員は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    'f_posUnionFlag_f3'),

  // unionFlag: F1（出向受入）— 常に非組合員
  c('unionFlag',
    _  => [UNION_MEMBER_CODE.NON_MEMBER],
    _  => '労働組合員は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    'f_unionFlag_f1'),

  // unionFlag: F2（社員）— band の isRegularEmployeeOrSecondmentAcceptance=false なら非組合員のみ
  c('unionFlag',
    (ms, row) => {
      const band = ms.jobLevels.find(e => e.label === (row.band as string | undefined))
      return (band && !band.isRegularEmployeeOrSecondmentAcceptance)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    _ => '労働組合員は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId,
    'f_unionFlag_f2'),

  // unionFlag: F3（雇用延長）— band の isExtendedEmployeeUnionMember=false なら非組合員のみ
  c('unionFlag',
    (ms, row) => {
      const band = ms.jobLevels.find(e => e.label === (row.band as string | undefined))
      return (band && !band.isExtendedEmployeeUnionMember)
        ? [UNION_MEMBER_CODE.NON_MEMBER] : [...UNION_MEMBER_CODES]
    },
    _ => '労働組合員は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isExtendedEmployee,
    'f_unionFlag_f3'),

  // 裁量対象: ポジション_裁量労働対象が「はい」のとき、positionBand / jobFamily / jobType を裁量対象に絞る
  c('positionBand',
    (ms, row) => {
      const noAutoCreate = getNoAutoCreate(row, ms)
      return ms.jobLevels.filter(e => {
        if (e.isDiscretionaryTarget === 1) return true
        if (e.isDiscretionaryTarget === 2) return !noAutoCreate
        return false
      }).map(e => e.label)
    },
    _ => 'ポジション_バンドは裁量対象に対応する選択肢から選択してください',
    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    'd_positionBand'),

  c('jobFamily',
    ms => {
      const targetCodes = new Set(ms.jobTypes.filter(e => e.isDiscretionaryTarget).map(e => e.jobFamilyCode))
      return ms.jobFamilies.filter(e => targetCodes.has(e.code)).map(e => e.label)
    },
    _ => 'ジョブファミリーは裁量対象に対応する選択肢から選択してください',
    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    'd_jobFamily'),

  c('jobType',
    (ms, row) => {
      const candidates = ms.jobTypes.filter(e => e.isDiscretionaryTarget)
      const parent = row.jobFamily
        ? ms.jobFamilies.find(jf => jf.label === (row.jobFamily as string))
        : undefined
      if (parent) {
        const filtered = candidates.filter(s => s.jobFamilyCode === parent.code)
        return (filtered.length > 0 ? filtered : candidates).map(e => e.label)
      }
      return candidates.map(e => e.label)
    },
    _ => 'ジョブタイプは裁量対象に対応する選択肢から選択してください',
    row => row.positionDiscretionaryWorkFlag === DISCRETIONARY_YES,
    'd_jobType'),

  // ポジション_裁量労働対象 — F1（出向受入）
  c('positionDiscretionaryWorkFlag',
    (ms, row) => {
      const position  = ms.officialPositions.find(e => e.label === (row.officialPositionCode as string | undefined))
      if (position  && !position.isDiscretionaryTarget)  return [DISCRETIONARY_NO]
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      const company   = ms.companies.find(e => e.label === (row.secondmentFromCompany as string | undefined))
      if (company   && !company.isDiscretionaryTarget)   return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    _ => 'ポジション_裁量労働対象は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    'd_posDisc_f1'),

  // ポジション_裁量労働対象 — F2/F3（社員/雇用延長）
  c('positionDiscretionaryWorkFlag',
    (ms, row) => {
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
    _ => 'ポジション_裁量労働対象は有効な選択肢から選択してください',
    (row, ms) => {
      const et = findEmpType(ms, row)
      return (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
          || !!et?.isExtendedEmployee
    },
    'd_posDisc_f23'),

  // 裁量労働対象（人）— F1（出向受入）
  c('discretionaryWorkFlag',
    (ms, row) => {
      const position  = ms.officialPositions.find(e => e.label === (row.officialPositionCode as string | undefined))
      if (position  && !position.isDiscretionaryTarget)  return [DISCRETIONARY_NO]
      const subFamily = ms.jobTypes.find(e => e.label === (row.jobType as string | undefined))
      if (subFamily && !subFamily.isDiscretionaryTarget) return [DISCRETIONARY_NO]
      const company   = ms.companies.find(e => e.label === (row.secondmentFromCompany as string | undefined))
      if (company   && !company.isDiscretionaryTarget)   return [DISCRETIONARY_NO]
      return [DISCRETIONARY_YES, DISCRETIONARY_NO]
    },
    _ => '裁量労働対象は有効な選択肢から選択してください',
    (row, ms) => !!findEmpType(ms, row)?.isSecondmentAcceptance,
    'd_disc_f1'),

  // 裁量労働対象（人）— F2/F3（社員/雇用延長）
  c('discretionaryWorkFlag',
    (ms, row) => {
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
    _ => '裁量労働対象は有効な選択肢から選択してください',
    (row, ms) => {
      const et = findEmpType(ms, row)
      return (!!et?.isRegularEmployee && !!row.userId && row.userId === row.groupEmployeeId)
          || !!et?.isExtendedEmployee
    },
    'd_disc_f23'),
]

// ── 評価ヘルパー ─────────────────────────────────────────────────────────────

/**
 * FieldRule を評価し、違反があれば ValidationIssue を返す。
 * - source が空（マスタ未ロード）はスキップ
 * - 空値は A 系必須チェックに委ねるためスキップ
 * - when が false なら空を返す
 * - validation が 'none' なら空を返す
 */
export function evaluateFieldRule(
  rule:    FieldRule,
  row:     AllocationRow,
  masters: AllMasters,
): ValidationIssue[] {
  if (rule.validation === 'none') return []
  if (rule.when && !rule.when(row, masters)) return []
  const allowed = rule.source(masters, row)
  if (allowed.length === 0) return []
  const val = row[rule.field] as string | undefined
  if (!val) return []
  if (allowed.includes(val)) return []

  const level = rule.validation === 'warning' ? 'warning' as const : 'error' as const
  // allowed が 1 件のときは修正値が確定するため suggestedPatch として付与する
  const suggestedPatch: Partial<AllocationRow> | undefined = allowed.length === 1
    ? { [rule.field]: allowed[0] } as Partial<AllocationRow>
    : undefined
  return [{ field: rule.field, level, message: rule.message!(val), ...(suggestedPatch && { suggestedPatch }) }]
}

/**
 * フィールドに適用される有効な source を返す。
 * 条件ルール（when あり）が一般ルール（when なし）より優先される。
 * options:'none' のルールは選択肢表示に関与しないためスキップ。
 * 該当ルールがなければ null。
 */
export function getEffectiveSource(
  field:   keyof AllocationRow,
  row:     AllocationRow,
  masters: AllMasters,
): string[] | null {
  const conditional = FIELD_RULES.find(r => r.field === field && r.options !== 'none' && r.when?.(row, masters))
  if (conditional) return conditional.source(masters, row)
  const general = FIELD_RULES.find(r => r.field === field && r.options !== 'none' && !r.when)
  return general ? general.source(masters, row) : null
}

// ── 後方互換エイリアス（fieldConstraints.ts / rules.ts からの移行用）────────────────

/** @deprecated Use FieldRule */
export type ConstraintRule = FieldRule
/** @deprecated Use FieldRule */
export type SuggestionRule = FieldRule
/** @deprecated Use FieldRule */
export type ValueRule      = FieldRule
/** @deprecated Use FIELD_RULES */
export const FIELD_CONSTRAINTS = FIELD_RULES
/** @deprecated Use evaluateFieldRule */
export const evaluateConstraint = evaluateFieldRule
