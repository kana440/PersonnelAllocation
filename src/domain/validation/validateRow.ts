import type { AllocationRow } from '../allocationRow'
import { BEFORE_AFTER_FIELD_PAIRS } from '../allocationRow'
import type { Organization } from '../schemas'
import type { AllCodeLists } from '../codeLists/aggregate'

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
  _codeLists: AllCodeLists,   // 将来: コードリスト値チェックに使用
): ValidationIssue[] {
  return [
    ...validateRequiredAfterFields(row),
    ...validateDepartmentCode(row, orgs),
    ...validateBandChangeReason(row),
    ...validateSecondmentConsistency(row),
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
