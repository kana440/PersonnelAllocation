import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { ValidationIssue } from './types'

/** A1-0: 申請区分（異動事由）は常に必須 */
function checkA1_0(row: AllocationRow): ValidationIssue[] {
  if (row.transferReason) return []
  return [{ field: 'transferReason', level: 'error', message: '申請区分（異動事由）は必須です' }]
}

/** A1-1: positionCode あり → ポジション属性フィールドは必須 */
function checkA1_1(row: AllocationRow): ValidationIssue[] {
  if (!row.positionCode) return []
  const issues: ValidationIssue[] = []
  const required: Array<[keyof AllocationRow, string]> = [
    ['departmentCode',                '組織コード'],
    ['officialPositionCode',          '役職'],
    ['location',                      '勤務場所'],
    ['costCenter',                    'コストセンター'],
    ['managerPositionCode',           '上司ポジションコード'],
    ['jobFamily',                     'ジョブファミリー'],
    ['jobType',                       'ジョブタイプ'],
    ['positionBand',                  'ポジション＿バンド'],
    ['trainingPositionFlag',          '業務研修ポジション'],
    ['positionUnionFlag',             'ポジション＿労働組合員'],
    ['positionDiscretionaryWorkFlag', 'ポジション＿裁量労働対象'],
  ]
  for (const [field, label] of required) {
    if (!row[field])
      issues.push({ field, level: 'error', message: `${label}は必須です` })
  }
  return issues
}

/** A1-2: userId あり → 人属性フィールドは必須 */
function checkA1_2(row: AllocationRow): ValidationIssue[] {
  if (!row.userId) return []
  const issues: ValidationIssue[] = []
  const required: Array<[keyof AllocationRow, string]> = [
    ['groupEmployeeId',      'グループ社員ID'],
    ['lastName',             '姓'],
    ['firstName',            '名'],
    ['employmentType',       '雇用タイプ'],
    ['concurrentType',       '本務兼務区分'],
    ['band',                 'バンド'],
    ['payGrade',             '給与等級'],
    ['unionFlag',            '労働組合員'],
    ['discretionaryWorkFlag','裁量労働対象'],
  ]
  for (const [field, label] of required) {
    if (!row[field])
      issues.push({ field, level: 'error', message: `ユーザーIDが入力されている場合、${label}は必須です` })
  }
  return issues
}

/** A2: 組織コードが出向者用組織 → 出向先会社は必須 */
function checkA2(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.departmentCode) return []
  const org = codeLists.orgMasterEntries.find(e => e.code === row.departmentCode)
  if (org?.organizationLevel !== '出向者用組織') return []
  if (row.secondmentToCompany) return []
  return [{ field: 'secondmentToCompany', level: 'error', message: '出向者用組織の場合、出向先会社は必須です' }]
}

/** A3: 雇用タイプが出向受入 → 出向元会社・出向元社員番号は必須 */
function checkA3(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.employmentType) return []
  const entry = codeLists.employmentTypes.find(e => e.label === row.employmentType)
  if (!entry?.isOutsourceAcceptance) return []
  const issues: ValidationIssue[] = []
  if (!row.secondmentFromCompany)
    issues.push({ field: 'secondmentFromCompany', level: 'error', message: '出向受入の場合、出向元会社は必須です' })
  if (!row.secondmentFromEmployeeNumber)
    issues.push({ field: 'secondmentFromEmployeeNumber', level: 'error', message: '出向受入の場合、出向元会社社員番号は必須です' })
  return issues
}

/** A4: 申請区分（異動事由）の兼務チェックサイン → 兼務理由は必須 */
function checkA4(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.transferReason) return []
  const entry = codeLists.transferReasons.find(e => e.label === row.transferReason)
  if (!entry?.concurrentCheckSign) return []
  if (row.concurrentReason) return []
  return [{ field: 'concurrentReason', level: 'error', message: '兼務チェックサインが設定されている場合、兼務理由は必須です' }]
}

/** A5: 役職のフリータイトルフラグ → フリータイトルは必須 */
function checkA5(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (!row.officialPositionCode) return []
  const entry = codeLists.officialPositions.find(e => e.label === row.officialPositionCode)
  if (!entry?.isFreeTitle) return []
  if (row.localJobTitle) return []
  return [{ field: 'localJobTitle', level: 'error', message: 'フリータイトル対象の役職の場合、フリータイトルは必須です' }]
}

export function runRequired(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  return [
    ...checkA1_0(row),
    ...checkA1_1(row),
    ...checkA1_2(row),
    ...checkA2(row, codeLists),
    ...checkA3(row, codeLists),
    ...checkA4(row, codeLists),
    ...checkA5(row, codeLists),
  ]
}
