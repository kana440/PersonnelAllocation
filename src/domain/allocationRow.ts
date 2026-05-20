import type { AllocationList } from './csvImport/allocationList/schema'

// AllocationRow = Excel 1行 + 連番 rowId + 操作グループ参照
// prev* 列群: Excelから読んだまま（不変・before状態）
// after 列群: applyOperationGroups が計算（直接保存しない）
export type AllocationRow = AllocationList & {
  rowId:            number     // 行番号（Excel行順・連番）
  operationGroupId?: string    // この行を変更した OperationGroup の id
}

// after フィールドと対応する prev* フィールドのペア一覧
// copyBeforeToAfter / rowDiff で使用する
export const BEFORE_AFTER_FIELD_PAIRS: ReadonlyArray<
  readonly [after: keyof AllocationList, before: keyof AllocationList]
> = [
  ['employmentType',                'prevEmploymentType'],
  ['concurrentType',                'prevConcurrentType'],
  ['concurrentReason',              'prevConcurrentReason'],
  ['secondmentFromCompany',         'prevSecondmentFromCompany'],
  ['secondmentFromEmployeeNumber',  'prevSecondmentFromEmployeeNumber'],
  ['leaveFlag',                     'prevLeaveFlag'],
  ['positionCode',                  'prevPositionCode'],
  ['departmentCode',                'prevDepartmentCode'],
  ['businessUnit',                  'prevBusinessUnit'],
  ['division',                      'prevDivision'],
  ['subDivision',                   'prevSubDivision'],
  ['group',                         'prevGroup'],
  ['team',                          'prevTeam'],
  ['officialPositionCode',          'prevOfficialPositionCode'],
  ['localJobTitle',                 'prevLocalJobTitle'],
  ['secondmentToCompany',           'prevSecondmentToCompany'],
  ['location',                      'prevLocation'],
  ['costCenter',                    'prevCostCenter'],
  ['managerPositionCode',           'prevManagerPositionCode'],
  ['managerName',                   'prevManagerName'],
  ['jobFamily',                     'prevJobFamily'],
  ['jobType',                       'prevJobType'],
  ['positionBand',                  'prevPositionBand'],
  ['band',                          'prevBand'],
  ['payGrade',                      'prevPayGrade'],
  ['trainingPositionFlag',          'prevTrainingPositionFlag'],
  ['nonUnionAgreementFlag',         'prevNonUnionAgreementFlag'],
  ['positionUnionFlag',             'prevPositionUnionFlag'],
  ['unionFlag',                     'prevUnionFlag'],
  ['positionDiscretionaryWorkFlag', 'prevPositionDiscretionaryWorkFlag'],
  ['discretionaryWorkFlag',         'prevDiscretionaryWorkFlag'],
] as const

// after列を before列のコピーで初期化（操作適用前の no-change ベースライン）
export function copyBeforeToAfter(row: AllocationRow): AllocationRow {
  const after: Partial<AllocationList> = {}
  for (const [afterKey, prevKey] of BEFORE_AFTER_FIELD_PAIRS) {
    ;(after as Record<string, unknown>)[afterKey] = row[prevKey]
  }
  return {
    ...row,
    ...after,
    // 変更メタデータはクリア（操作ハンドラーが設定する）
    transferReason:     undefined,
    memo:               undefined,
    promotionSign:      undefined,
    demotionReason:     undefined,
    payGradeChangeSign: undefined,
    operationGroupId:   undefined,
  }
}

// before/after 列群の差分を返す
// after値が before値と異なるフィールドのみ返す
export function rowDiff(row: AllocationRow): Array<{
  afterKey:   keyof AllocationList
  prevValue:  string
  afterValue: string
}> {
  return BEFORE_AFTER_FIELD_PAIRS.flatMap(([afterKey, prevKey]) => {
    const prevValue  = (row[prevKey]  as string | undefined) ?? ''
    const afterValue = (row[afterKey] as string | undefined) ?? ''
    return prevValue !== afterValue ? [{ afterKey, prevValue, afterValue }] : []
  })
}

// 新規行用の rowId を計算（既存 rows の最大値 + 1）
export function nextRowId(rows: AllocationRow[]): number {
  return rows.length === 0 ? 1 : Math.max(...rows.map(r => r.rowId)) + 1
}

// ── AfterValues ──────────────────────────────────────────────────────────────
// after フィールドの部分的な変更値。
// DirectEditOperation / executeOperation の入力型として使用する。
export type AfterValues = Partial<
  Pick<
    AllocationList,
    | 'employmentType' | 'concurrentType' | 'concurrentReason'
    | 'secondmentFromCompany' | 'secondmentFromEmployeeNumber'
    | 'leaveFlag' | 'positionCode' | 'departmentCode'
    | 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'
    | 'officialPositionCode' | 'localJobTitle' | 'secondmentToCompany'
    | 'location' | 'costCenter' | 'managerPositionCode' | 'managerName'
    | 'jobFamily' | 'jobType' | 'positionBand' | 'band' | 'payGrade'
    | 'trainingPositionFlag' | 'nonUnionAgreementFlag' | 'positionUnionFlag'
    | 'unionFlag' | 'positionDiscretionaryWorkFlag' | 'discretionaryWorkFlag'
    | 'transferReason' | 'memo' | 'promotionSign' | 'demotionReason' | 'payGradeChangeSign'
  >
>
