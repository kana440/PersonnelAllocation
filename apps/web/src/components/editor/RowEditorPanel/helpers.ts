import { BEFORE_AFTER_FIELD_PAIRS, FIELD_METADATA } from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { buildBaseOptions, getGroupedFieldOptions, type OptionsGroup } from '@personnel/domain/choices'

export type { OptionsGroup }


// ── 表示メタ ─────────────────────────────────────────────────────────────────

// Excel 列順表示ラベル（before キーの日本語名を after キーとして使う）
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  BEFORE_AFTER_FIELD_PAIRS.map(([afterKey, prevKey]) => [
    String(afterKey),
    ALLOCATION_LIST_LABEL_MAP[String(prevKey)]?.ja ?? String(afterKey),
  ])
)

// Excel 列順でフィールドを表示
export const EDITOR_FIELD_ORDER: readonly string[] = [
  'employmentType', 'concurrentType', 'concurrentReason',
  'secondmentFromCompany', 'secondmentFromEmployeeNumber', 'leaveOfAbsenceSign',
  'positionCode', 'departmentCode',
  'businessUnit', 'division', 'subDivision', 'group', 'team',
  'officialPositionCode', 'localJobTitle', 'secondmentToCompany',
  'location', 'costCenter', 'managerPositionCode', 'managerName',
  'jobFamily', 'jobType', 'positionBand', 'band', 'payGrade',
  'trainingPositionFlag', 'nonUnionAgreementFlag',
  'positionUnionFlag', 'unionFlag',
  'positionDiscretionaryWorkFlag', 'discretionaryWorkFlag',
]

// after キー → before キーの逆引き
export const BEFORE_KEY_FOR: Record<string, string> = Object.fromEntries(
  FIELD_METADATA.map(f => [String(f.after), String(f.before)])
)

// ── UI フィールド分類 ─────────────────────────────────────────────────────────

// Y/N フラグフィールド（現在は未使用; 将来の Y/N 系フィールド向けに残す）
export const FLAG_FIELDS  = new Set<string>()
export const FLAG_OPTIONS = ['Y', 'N']

// "1"/"0" チェックボックスフィールド（Excel データ入力規則と対応）
export const BOOLEAN_1_FIELDS = new Set([
  'nonUnionAgreementFlag',
  'leaveOfAbsenceSign',
  'promotionSign',
  'payGradeChangeSign',
])

// OrgCombobox で組織検索するフィールド
export const ORG_FIELDS = new Set(['departmentCode'])

// 人名検索でポジションコードをセットするフィールド
export const MANAGER_POS_FIELDS = new Set(['managerPositionCode'])

// 編集不可フィールド（計算値のみ）
export const READONLY_FIELDS = new Set<string>([
  'groupEmployeeId', 'groupEmployeeNumber',
])

// ── 選択肢生成 ────────────────────────────────────────────────────────────────

/**
 * フィールドに対応する選択肢リストを返す。
 * ドメイン層の getFieldOptions / buildBaseOptions に委譲する。
 * FLAG_FIELDS（Y/N 系）のみここで処理。
 */
export function getOptions(
  key:               string,
  masters:         AllMasters,
  currentJobFamily?: string,
  row?:              AllocationRow,
): OptionsGroup {
  if (FLAG_FIELDS.has(key)) return { valid: FLAG_OPTIONS, invalid: [] }
  if (row) return getGroupedFieldOptions(key, row, masters, currentJobFamily)
  return { valid: buildBaseOptions(key, masters, currentJobFamily), invalid: [] }
}

