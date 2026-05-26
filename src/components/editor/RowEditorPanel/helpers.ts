import { BEFORE_AFTER_FIELD_PAIRS, FIELD_METADATA } from '../../../domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '../../../domain/csvImport/allocationList/labels'
import { CONCURRENT_TYPES } from '../../../domain/codeLists/concurrentType'
import { UNION_MEMBER_CODES } from '../../../domain/codeLists/unionMember'
import type { AllCodeLists } from '../../../domain/codeLists/aggregate'

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
  'secondmentFromCompany', 'secondmentFromEmployeeNumber', 'leaveFlag',
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

// codeListKey → AllCodeLists のプロパティ名
export const CODE_LIST_KEYS: Partial<Record<string, string>> = {
  employmentType:                'employmentTypes',
  transferReason:                'transferReasons',
  jobFamily:                     'jobFamilies',
  officialPositionCode:          'officialPositions',
  payGrade:                      'payGrades',
  positionBand:                  'jobLevels',
  band:                          'jobLevels',
  location:                      'workLocations',
  concurrentReason:              'concurrentReasons',
  demotionReason:                'demotionReasons',
  secondmentFromCompany:         'companies',
  trainingPositionFlag:          'trainingPositions',
  positionDiscretionaryWorkFlag: 'discretionaryWorkOptions',
  discretionaryWorkFlag:         'discretionaryWorkOptions',
}

// Y/N フラグフィールド（現在は未使用; 将来の Y/N 系フィールド向けに残す）
export const FLAG_FIELDS  = new Set<string>()
export const FLAG_OPTIONS = ['Y', 'N']

// "1"/"" チェックボックスフィールド
export const BOOLEAN_1_FIELDS = new Set(['nonUnionAgreementFlag', 'leaveFlag'])

// OrgCombobox で組織検索するフィールド
export const ORG_FIELDS = new Set(['departmentCode'])

// 人名検索でポジションコードをセットするフィールド
export const MANAGER_POS_FIELDS = new Set(['managerPositionCode'])

// 編集不可フィールド（個人識別子）
export const READONLY_FIELDS = new Set<string>([
  'userId', 'employeeNumber', 'lastName', 'firstName',
  'groupEmployeeId', 'groupEmployeeNumber',
])

/** フィールドに対応する選択肢リストを返す純粋関数 */
export function getOptions(key: string, codeLists: AllCodeLists, currentJobFamily?: string): string[] {
  if (FLAG_FIELDS.has(key)) return FLAG_OPTIONS
  if (key === 'concurrentType') return [...CONCURRENT_TYPES]
  if (key === 'positionUnionFlag' || key === 'unionFlag') return [...UNION_MEMBER_CODES]

  if (key === 'jobType') {
    const parentEntry = codeLists.jobFamilies.find(jf => jf.label === currentJobFamily)
    const filtered = parentEntry
      ? codeLists.subJobFamilies.filter(s => s.jobFamilyCode === parentEntry.code)
      : codeLists.subJobFamilies
    return filtered.map(s => s.label)
  }

  const listKey = CODE_LIST_KEYS[key]
  if (!listKey) return []
  const list = (codeLists as unknown as Record<string, unknown>)[listKey]
  if (!Array.isArray(list)) return []
  return list.map((v: unknown) => {
    if (typeof v === 'string') return v
    const entry = v as Record<string, string>
    return entry.label ?? entry.code ?? String(v)
  })
}

/** band + jobType.compensationCategory から給与等級を自動導出する純粋関数 */
export function derivePayGrade(jobTypeLabel: string, bandLabel: string, codeLists: AllCodeLists): string {
  if (!jobTypeLabel || !bandLabel) return ''
  const subJobFamily = codeLists.subJobFamilies.find(s => s.label === jobTypeLabel)
  if (!subJobFamily?.compensationCategory) return ''
  const pg = codeLists.payGrades.find(
    p => p.compensationCategory === subJobFamily.compensationCategory && p.band === bandLabel
  )
  return pg?.label ?? ''
}
