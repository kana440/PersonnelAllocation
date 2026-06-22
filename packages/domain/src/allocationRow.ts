import type { AllocationList } from './csvImport/allocationList/schema'

// AllocationRow = Excel 1行 + 連番 rowId + 操作グループ参照
// prev* 列群: Excelから読んだまま（不変・before状態）
// after 列群: 編集後の状態
export type AllocationRow = AllocationList & {
  rowId:            number     // 行番号（Excel行順・連番）
  operationGroupId?: string    // この行を変更した OperationGroup の id
}

// ── FieldBinding ──────────────────────────────────────────────────────────────
// 各フィールドがポジション・人のどれに属するかを示す。
// 操作時（移動・削除・紐付け解除）のコピー/リセット挙動を決定する。
//
//   position : ポジション連動。席ごと移動、ポジション削除でblank
//   person   : 人連動。人と一緒に移動、人削除でblank
//   both     : 両方連動。どちらが動いても追従
//
// ※ meta 扱いのフィールド（transferReason / memo / promotionSign 等）は
//   FIELD_METADATA に含めない。操作ハンドラーが個別にクリアする。
//
// 詳細: docs/09-position-person-domain.md
export type FieldBinding = 'position' | 'jobInfo' | 'both'

export interface FieldMeta {
  readonly after:   keyof AllocationList
  readonly before:  keyof AllocationList
  readonly binding: FieldBinding
}

// ── FIELD_METADATA ────────────────────────────────────────────────────────────
// after/before フィールドペアと FieldBinding の正規ソース。
// BEFORE_AFTER_FIELD_PAIRS はここから導出する（後方互換）。
//
// ※ binding の分類は暫定。HR運用ルール確定後にレビューする。
export const FIELD_METADATA: ReadonlyArray<FieldMeta> = [
  // ── position ────────────────────────────────────────────────────────────────
  { after: 'positionCode',               before: 'prevPositionCode',               binding: 'position' },
  { after: 'officialPositionCode',       before: 'prevOfficialPositionCode',       binding: 'position' },
  { after: 'localJobTitle',              before: 'prevLocalJobTitle',              binding: 'position' },
  { after: 'managerPositionCode',        before: 'prevManagerPositionCode',        binding: 'position' },
  { after: 'positionBand',               before: 'prevPositionBand',               binding: 'position' },
  { after: 'positionUnionFlag',          before: 'prevPositionUnionFlag',          binding: 'position' },
  { after: 'positionDiscretionaryWorkFlag', before: 'prevPositionDiscretionaryWorkFlag', binding: 'position' },
  { after: 'trainingPositionFlag',       before: 'prevTrainingPositionFlag',       binding: 'position' },

  // ── both ──────────────────────────────────────────────────────────────────
  { after: 'jobFamily',                  before: 'prevJobFamily',                  binding: 'both' },
  { after: 'jobType',                    before: 'prevJobType',                    binding: 'both' },
  { after: 'departmentCode',             before: 'prevDepartmentCode',             binding: 'both'     }, // 組織はポジションにも人にも属する
  { after: 'businessUnit',              before: 'prevBusinessUnit',               binding: 'both' },
  { after: 'division',                   before: 'prevDivision',                   binding: 'both' },
  { after: 'subDivision',               before: 'prevSubDivision',               binding: 'both' },
  { after: 'group',                      before: 'prevGroup',                      binding: 'both' },
  { after: 'team',                       before: 'prevTeam',                       binding: 'both' },
  { after: 'location',                   before: 'prevLocation',                   binding: 'both' },
  { after: 'costCenter',                 before: 'prevCostCenter',                 binding: 'both' },

  // ── person ──────────────────────────────────────────────────────────────────
  { after: 'employmentType',             before: 'prevEmploymentType',             binding: 'jobInfo' },
  { after: 'band',                       before: 'prevBand',                       binding: 'jobInfo' },
  { after: 'payGrade',                   before: 'prevPayGrade',                   binding: 'jobInfo' },
  { after: 'unionFlag',                  before: 'prevUnionFlag',                  binding: 'jobInfo' },
  { after: 'discretionaryWorkFlag',      before: 'prevDiscretionaryWorkFlag',      binding: 'jobInfo' },
  { after: 'nonUnionAgreementFlag',      before: 'prevNonUnionAgreementFlag',      binding: 'jobInfo' },
  { after: 'leaveOfAbsenceSign',                  before: 'prevLeaveOfAbsenceSign',                  binding: 'jobInfo' },

  // ── allocation ──────────────────────────────────────────────────────────────
  { after: 'concurrentType',             before: 'prevConcurrentType',             binding: 'jobInfo' },
  { after: 'concurrentReason',           before: 'prevConcurrentReason',           binding: 'jobInfo' },
  { after: 'secondmentFromCompany',      before: 'prevSecondmentFromCompany',      binding: 'jobInfo' },
  { after: 'secondmentFromEmployeeNumber', before: 'prevSecondmentFromEmployeeNumber', binding: 'jobInfo' },
  { after: 'secondmentToCompany',        before: 'prevSecondmentToCompany',        binding: 'jobInfo' },
  { after: 'managerName',                before: 'prevManagerName',                binding: 'position' },
] as const satisfies ReadonlyArray<FieldMeta>

// ── ヘルパー ──────────────────────────────────────────────────────────────────

/** binding でフィルタした FieldMeta の配列を返す */
export const fieldsByBinding = (binding: FieldBinding): ReadonlyArray<FieldMeta> =>
  FIELD_METADATA.filter(f => f.binding === binding)

/** binding に属する after キーの集合を返す（操作ハンドラーでの null 化などに使用） */
export const afterKeysByBinding = (binding: FieldBinding): ReadonlyArray<keyof AllocationList> =>
  FIELD_METADATA.filter(f => f.binding === binding).map(f => f.after)

// ── 後方互換エイリアス ────────────────────────────────────────────────────────
// FIELD_METADATA から導出。既存コード（ExcelPreview / RowEditorPanel / validateRow）は変更不要。
export const BEFORE_AFTER_FIELD_PAIRS: ReadonlyArray<
  readonly [after: keyof AllocationList, before: keyof AllocationList]
> = FIELD_METADATA.map(f => [f.after, f.before] as const)

// after列を before列のコピーで初期化（操作適用前の no-change ベースライン）
export function copyBeforeToAfter(row: AllocationRow): AllocationRow {
  const after: Partial<AllocationList> = {}
  for (const { after: afterKey, before: prevKey } of FIELD_METADATA) {
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
  return FIELD_METADATA.flatMap(({ after: afterKey, before: prevKey }) => {
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
    | 'leaveOfAbsenceSign' | 'positionCode' | 'departmentCode'
    | 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'
    | 'officialPositionCode' | 'localJobTitle' | 'secondmentToCompany'
    | 'location' | 'costCenter' | 'managerPositionCode' | 'managerName'
    | 'jobFamily' | 'jobType' | 'positionBand' | 'band' | 'payGrade'
    | 'trainingPositionFlag' | 'nonUnionAgreementFlag' | 'positionUnionFlag'
    | 'unionFlag' | 'positionDiscretionaryWorkFlag' | 'discretionaryWorkFlag'
    | 'transferReason' | 'memo' | 'promotionSign' | 'demotionReason' | 'payGradeChangeSign'
    | 'assignee'
  >
>
