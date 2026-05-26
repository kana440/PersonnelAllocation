import type { AllocationRow } from '../allocationRow'
import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { Organization } from '../schemas'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { RowChanges } from '../review/changeDetection'
import { UNION_MEMBER_CODES } from '../codeLists/unionMember'
import { CONCURRENT_TYPES } from '../codeLists/concurrentType'

export type ValidationLevel = 'warning' | 'error'

export interface ValidationIssue {
  field:   keyof AllocationRow
  level:   ValidationLevel
  message: string
}

// ── 純粋関数バリデーター ──────────────────────────────────────────────────────
// 各関数は独立していて単体テスト可能。
// 参照データ（orgs, codeLists）は引数で受け取る（副作用なし）。

/** 組織コードが既知の組織に存在するか */
function validateDepartmentCode(
  row:  AllocationRow,
  orgs: Organization[],
): ValidationIssue[] {
  const code = row.departmentCode
  if (!code) return []
  const known = orgs.some(o => o.externalCode === code || o.id === code)
  if (!known) {
    return [{
      field:   'departmentCode',
      level:   'error',
      message: `組織コード "${code}" はマスタに存在しません`,
    }]
  }
  return []
}

/** 発令後の必須フィールドが空でないか */
function validateRequiredAfterFields(row: AllocationRow): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!row.userId) {
    issues.push({ field: 'userId', level: 'warning', message: 'ユーザーIDが未入力です' })
  }
  if (!row.departmentCode) {
    issues.push({ field: 'departmentCode', level: 'warning', message: '組織コードが未入力です' })
  }
  return issues
}

/** 発令前後でバンドが変わる場合、異動事由が設定されているか */
function validateBandChangeReason(row: AllocationRow): ValidationIssue[] {
  const prevBand  = row.prevBand  ?? row.prevPositionBand  ?? ''
  const afterBand = row.band ?? row.positionBand ?? ''
  if (prevBand && afterBand && prevBand !== afterBand && !row.transferReason) {
    return [{
      field:   'transferReason',
      level:   'warning',
      message: 'バンドが変更されていますが異動事由が未入力です',
    }]
  }
  return []
}

/**
 * 昇級・降級（同一対応組織内のバンド変更）でポジションが変わっていない場合はエラー。
 * ポジション未変更のまま band だけ変えることは HR 運用上許容されない。
 * Excel 保存・出力は妨げない（呼び出し側が errors をブロックに使わない前提）。
 */
function validateBandChangeRequiresNewPosition(row: AllocationRow, changes?: RowChanges): ValidationIssue[] {
  if (!changes) return []
  const { kinds } = changes
  // 昇級 or 降級 かつ transfer なし → 同一（対応）組織内のバンド変更
  const isSameOrgBandChange =
    (kinds.has('promotion') || kinds.has('demotion')) && !kinds.has('transfer')
  if (!isSameOrgBandChange) return []

  const positionChanged = (row.positionCode ?? '') !== (row.prevPositionCode ?? '')
  if (positionChanged) return []

  return [{
    field:   'positionCode',
    level:   'error',
    message: '昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です）',
  }]
}

/** V04: 兼務の場合は兼務理由が必要 */
function validateConcurrentReason(row: AllocationRow): ValidationIssue[] {
  if (row.concurrentType === '兼務' && !row.concurrentReason) {
    return [{
      field:   'concurrentReason',
      level:   'warning',
      message: '兼務の場合は兼務理由を入力してください',
    }]
  }
  return []
}

/** V50: 異動検知時に異動事由が未入力 / V05・V52: 降格検知時に降格理由が未入力 */
function validateChangeReasons(row: AllocationRow, changes?: RowChanges): ValidationIssue[] {
  if (!changes) return []
  const issues: ValidationIssue[] = []
  if (changes.kinds.has('transfer') && !row.transferReason) {
    issues.push({
      field:   'transferReason',
      level:   'warning',
      message: '異動が検出されましたが異動事由が未入力です',
    })
  }
  if (changes.kinds.has('demotion') && !row.demotionReason) {
    issues.push({
      field:   'demotionReason',
      level:   'warning',
      message: '降級が検出されましたが降格理由が未入力です',
    })
  }
  return issues
}

/** V12: 役職は officialPositions マスタに存在するラベル値 */
function validateOfficialPositionCode(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const val = row.officialPositionCode
  if (!val) return []
  if (codeLists.officialPositions.length === 0) return []   // マスタ未ロード時はスキップ
  if (codeLists.officialPositions.some(e => e.label === val)) return []
  return [{
    field:   'officialPositionCode',
    level:   'warning',
    message: `役職 "${val}" はマスタに存在しません`,
  }]
}

/** V13: 給与等級は payGrades マスタに存在するラベル値 */
function validatePayGrade(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const val = row.payGrade
  if (!val) return []
  if (codeLists.payGrades.length === 0) return []
  if (codeLists.payGrades.some(e => e.label === val)) return []
  return [{ field: 'payGrade', level: 'warning', message: `給与等級 "${val}" はマスタに存在しません` }]
}

/** V14: 勤務場所は workLocations マスタに存在するラベル値 */
function validateLocation(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const val = row.location
  if (!val) return []
  if (codeLists.workLocations.length === 0) return []   // マスタ未ロード時はスキップ
  if (codeLists.workLocations.some(e => e.label === val)) return []
  return [{
    field:   'location',
    level:   'warning',
    message: `勤務場所 "${val}" はマスタに存在しません`,
  }]
}

/** V15: 雇用タイプは employmentTypes マスタに存在するラベル値 */
function validateEmploymentType(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const val = row.employmentType
  if (!val) return []
  if (codeLists.employmentTypes.length === 0) return []
  if (codeLists.employmentTypes.some(e => e.label === val)) return []
  return [{ field: 'employmentType', level: 'warning', message: `雇用タイプ "${val}" はマスタに存在しません` }]
}

/** ジョブファミリーは jobFamilies マスタに存在するラベル値 */
function validateJobFamily(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const val = row.jobFamily
  if (!val) return []
  if (codeLists.jobFamilies.length === 0) return []
  if (codeLists.jobFamilies.some(e => e.label === val)) return []
  return [{ field: 'jobFamily', level: 'warning', message: `ジョブファミリー "${val}" はマスタに存在しません` }]
}

/** V16: jobType が選択中の jobFamily の subJobFamilies に含まれるか */
function validateJobType(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const jobType = row.jobType
  if (!jobType) return []
  if (codeLists.subJobFamilies.length === 0) return []
  const parentEntry = codeLists.jobFamilies.find(jf => jf.label === row.jobFamily)
  if (parentEntry) {
    const filtered = codeLists.subJobFamilies.filter(s => s.jobFamilyCode === parentEntry.code)
    if (filtered.some(s => s.label === jobType)) return []
    return [{ field: 'jobType', level: 'warning', message: `ジョブタイプ "${jobType}" は選択したジョブファミリーの子に含まれません` }]
  }
  if (codeLists.subJobFamilies.some(s => s.label === jobType)) return []
  return [{ field: 'jobType', level: 'warning', message: `ジョブタイプ "${jobType}" はマスタに存在しません` }]
}

/** band / positionBand は jobLevels マスタに存在するラベル値 */
function validateBandInMaster(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  if (codeLists.jobLevels.length === 0) return []
  const labels = new Set(codeLists.jobLevels.map(e => e.label))
  const issues: ValidationIssue[] = []
  const band = row.band
  if (band && !labels.has(band))
    issues.push({ field: 'band', level: 'warning', message: `バンド "${band}" はマスタに存在しません` })
  const positionBand = row.positionBand
  if (positionBand && !labels.has(positionBand))
    issues.push({ field: 'positionBand', level: 'warning', message: `ポジション_バンド "${positionBand}" はマスタに存在しません` })
  return issues
}

/** 労働組合員 / ポジション_労働組合員 は UNION_MEMBER_CODES に含まれる値か */
function validateUnionFlag(row: AllocationRow): ValidationIssue[] {
  const valid = new Set<string>(UNION_MEMBER_CODES)
  const issues: ValidationIssue[] = []
  const uf = row.unionFlag as string | undefined
  if (uf && !valid.has(uf))
    issues.push({ field: 'unionFlag', level: 'warning', message: `労働組合員 "${uf}" はリスト値と一致しません（${UNION_MEMBER_CODES.join('・')}）` })
  const puf = row.positionUnionFlag as string | undefined
  if (puf && !valid.has(puf))
    issues.push({ field: 'positionUnionFlag', level: 'warning', message: `ポジション_労働組合員 "${puf}" はリスト値と一致しません（${UNION_MEMBER_CODES.join('・')}）` })
  return issues
}

/** V65: 業務研修ポジション / V66-V67: 裁量労働区分 はマスタ値か */
function validateTrainingAndDiscretionaryFlags(row: AllocationRow, codeLists: AllCodeLists): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const tpf = row.trainingPositionFlag as string | undefined
  if (tpf && codeLists.trainingPositions.length > 0) {
    if (!codeLists.trainingPositions.some(e => e.code === tpf))
      issues.push({ field: 'trainingPositionFlag', level: 'warning', message: `業務研修ポジション "${tpf}" はリスト値と一致しません` })
  }
  const dwOptions = codeLists.discretionaryWorkOptions
  if (dwOptions.length > 0) {
    const pdwf = row.positionDiscretionaryWorkFlag as string | undefined
    if (pdwf && !dwOptions.some(e => e.code === pdwf))
      issues.push({ field: 'positionDiscretionaryWorkFlag', level: 'warning', message: `ポジション_裁量労働区分 "${pdwf}" はリスト値と一致しません` })
    const dwf = row.discretionaryWorkFlag as string | undefined
    if (dwf && !dwOptions.some(e => e.code === dwf))
      issues.push({ field: 'discretionaryWorkFlag', level: 'warning', message: `裁量労働区分 "${dwf}" はリスト値と一致しません` })
  }
  return issues
}

/** V61: ポジションコードは P + 8桁半角数字（_pos_ 始まりの内部採番は対象外） */
function validatePositionCodeFormat(row: AllocationRow): ValidationIssue[] {
  const code = row.positionCode
  if (!code) return []
  if (code.startsWith('_pos_')) return []   // ツール内部採番はチェック不要
  if (/^P\d{8}$/.test(code)) return []
  return [{
    field:   'positionCode',
    level:   'warning',
    message: 'ポジションコードは「P」+ 8桁半角数字の形式で入力してください（例: P12345678）',
  }]
}

/** V60: 社員番号は7桁の半角数字 */
function validateEmployeeNumberFormat(row: AllocationRow): ValidationIssue[] {
  const num = row.employeeNumber
  if (!num) return []
  if (/^\d{7}$/.test(num)) return []
  return [{
    field:   'employeeNumber',
    level:   'warning',
    message: '社員番号は7桁の半角数字で入力してください',
  }]
}

/** 上司ポジションコードの整合性チェック（存在・自己参照・循環） */
function validateManagerPositionCode(row: AllocationRow, allRows: AllocationRow[]): ValidationIssue[] {
  const mgrCode = row.managerPositionCode
  if (!mgrCode || !allRows.length) return []

  const mgrRow = allRows.find(r => r.positionCode === mgrCode)
  if (!mgrRow) {
    return [{
      field:   'managerPositionCode',
      level:   'warning',
      message: `上司ポジションコード "${mgrCode}" が見つかりません`,
    }]
  }

  if (row.positionCode && mgrCode === row.positionCode) {
    return [{
      field:   'managerPositionCode',
      level:   'error',
      message: '自分自身を上司ポジションに設定できません',
    }]
  }

  // 循環チェック: mgrCode から上に辿って row.positionCode が現れたら循環
  if (row.positionCode) {
    const posToMgr = new Map<string, string>()
    for (const r of allRows) {
      if (r.positionCode && r.managerPositionCode) posToMgr.set(r.positionCode, r.managerPositionCode)
    }
    let cur: string | undefined = posToMgr.get(mgrCode)
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      if (cur === row.positionCode) {
        return [{
          field:   'managerPositionCode',
          level:   'error',
          message: '配下のポジションを上司に設定できません（循環参照）',
        }]
      }
      cur = posToMgr.get(cur)
    }
  }

  return []
}

/** V17: 本務兼務区分が固定値リスト（本務/兼務/出向箱）に含まれるか */
function validateConcurrentTypeInMaster(row: AllocationRow): ValidationIssue[] {
  const val = row.concurrentType
  if (!val) return []
  if ((CONCURRENT_TYPES as readonly string[]).includes(val)) return []
  return [{
    field:   'concurrentType',
    level:   'warning',
    message: `本務兼務区分 "${val}" はリスト値と一致しません（${CONCURRENT_TYPES.join('・')}）`,
  }]
}

/** V30: 兼務区分が「兼務」でないのに兼務理由が設定されている */
function validateConcurrentReasonConsistency(row: AllocationRow): ValidationIssue[] {
  if (row.concurrentType !== '兼務' && row.concurrentReason) {
    return [{
      field:   'concurrentReason',
      level:   'warning',
      message: '兼務区分が「兼務」でないのに兼務理由が設定されています',
    }]
  }
  return []
}

/** V40: 出向元会社が設定されているが出向元社員番号が未入力 */
function validateSecondmentFromEmployeeNumber(row: AllocationRow): ValidationIssue[] {
  if (row.secondmentFromCompany && !row.secondmentFromEmployeeNumber) {
    return [{
      field:   'secondmentFromEmployeeNumber',
      level:   'warning',
      message: '出向元会社が設定されていますが出向元社員番号が未入力です',
    }]
  }
  return []
}

/** V41: 出向元社員番号が設定されているが出向元会社が未入力 */
function validateSecondmentFromCompany(row: AllocationRow): ValidationIssue[] {
  if (row.secondmentFromEmployeeNumber && !row.secondmentFromCompany) {
    return [{
      field:   'secondmentFromCompany',
      level:   'warning',
      message: '出向元社員番号が設定されていますが出向元会社が未入力です',
    }]
  }
  return []
}

/** 出向先会社が設定されているが組織コードが未設定 */
function validateSecondmentConsistency(row: AllocationRow): ValidationIssue[] {
  if (row.secondmentToCompany && !row.departmentCode) {
    return [{
      field:   'secondmentToCompany',
      level:   'warning',
      message: '出向先会社が設定されていますが出向先組織コードが未入力です',
    }]
  }
  return []
}

// ── メインバリデーション関数 ─────────────────────────────────────────────────
export function validateRow(
  row:       AllocationRow,
  orgs:      Organization[],
  codeLists: AllCodeLists,
  changes?:  RowChanges,
  allRows?:  AllocationRow[],
): ValidationIssue[] {
  return [
    ...validateRequiredAfterFields(row),
    ...validateDepartmentCode(row, orgs),
    ...validateBandChangeReason(row),
    ...validateSecondmentConsistency(row),
    ...validateSecondmentFromEmployeeNumber(row),
    ...validateSecondmentFromCompany(row),
    ...validateConcurrentReason(row),
    ...validateConcurrentTypeInMaster(row),
    ...validateConcurrentReasonConsistency(row),
    ...validateChangeReasons(row, changes),
    ...validateBandChangeRequiresNewPosition(row, changes),
    ...validateOfficialPositionCode(row, codeLists),
    ...validateLocation(row, codeLists),
    ...validatePayGrade(row, codeLists),
    ...validateEmploymentType(row, codeLists),
    ...validateJobFamily(row, codeLists),
    ...validateJobType(row, codeLists),
    ...validateBandInMaster(row, codeLists),
    ...validateUnionFlag(row),
    ...validateTrainingAndDiscretionaryFlags(row, codeLists),
    ...validateEmployeeNumberFormat(row),
    ...validatePositionCodeFormat(row),
    ...(allRows ? validateManagerPositionCode(row, allRows) : []),
  ]
}

// ── フィールドごとのイシュー抽出ヘルパー ─────────────────────────────────────
export function issuesForField(
  issues: ValidationIssue[],
  field:  keyof AllocationRow,
): ValidationIssue[] {
  return issues.filter(i => i.field === field)
}

// ── 差分フィールドまたはイシューがある after フィールドの集合を返す ──────────
// RowEditorPanel でデフォルト表示する行を決めるために使用
export function fieldsToShow(
  row:    AllocationRow,
  issues: ValidationIssue[],
): Set<keyof AllocationRow> {
  const fields = new Set<keyof AllocationRow>()
  const issueFields = new Set(issues.map(i => i.field))

  for (const [afterKey, prevKey] of BEFORE_AFTER_FIELD_PAIRS) {
    const prevVal  = (row[prevKey]  as string | undefined) ?? ''
    const afterVal = (row[afterKey] as string | undefined) ?? ''
    if (prevVal !== afterVal || issueFields.has(afterKey)) {
      fields.add(afterKey)
    }
  }
  // 異動事由は常に表示
  fields.add('transferReason' as keyof AllocationRow)
  return fields
}
