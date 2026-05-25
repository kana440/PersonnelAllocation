import type { AllocationRow } from '../allocationRow'
import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { Organization } from '../schemas'
import type { AllCodeLists } from '../codeLists/aggregate'
import type { RowChanges } from '../review/changeDetection'

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
  row:        AllocationRow,
  orgs:       Organization[],
  _codeLists: AllCodeLists,   // 将来: コードリスト値チェックに使用
  changes?:   RowChanges,
): ValidationIssue[] {
  return [
    ...validateRequiredAfterFields(row),
    ...validateDepartmentCode(row, orgs),
    ...validateBandChangeReason(row),
    ...validateSecondmentConsistency(row),
    ...validateConcurrentReason(row),
    ...validateChangeReasons(row, changes),
    ...validateBandChangeRequiresNewPosition(row, changes),
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
