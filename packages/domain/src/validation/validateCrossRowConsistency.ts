import type { AllocationRow } from '../allocationRow'

export interface ConsistencyIssue {
  groupEmployeeId: string
  field:           string
  valueA:          string
  valueB:          string
  rowIdA:          number
  rowIdB:          number
}

// 出向・兼務など同一グループ社員IDを持つ行間の整合チェック。
// サーバー側の提出バリデーション、またはフロントのレビュー表示の両方で使える純粋関数。
export function validateCrossRowConsistency(rows: AllocationRow[]): ConsistencyIssue[] {
  const byGroupId = new Map<string, AllocationRow[]>()
  for (const row of rows) {
    const gid = row.groupEmployeeId
    if (!gid) continue
    const bucket = byGroupId.get(gid) ?? []
    bucket.push(row)
    byGroupId.set(gid, bucket)
  }

  const issues: ConsistencyIssue[] = []
  for (const [gid, group] of byGroupId) {
    if (group.length < 2) continue

    // band の不一致チェック
    const bands = group.map(r => r.band ?? '')
    const uniqueBands = [...new Set(bands.filter(Boolean))]
    if (uniqueBands.length > 1) {
      issues.push({
        groupEmployeeId: gid,
        field:   'band',
        valueA:  uniqueBands[0]!,
        valueB:  uniqueBands[1]!,
        rowIdA:  group[0]!.rowId,
        rowIdB:  group[1]!.rowId,
      })
    }

    // employmentType の不一致チェック（出向元・先で揃える必要あり）
    const empTypes = group.map(r => r.employmentType ?? '')
    const uniqueEmpTypes = [...new Set(empTypes.filter(Boolean))]
    if (uniqueEmpTypes.length > 1) {
      issues.push({
        groupEmployeeId: gid,
        field:   'employmentType',
        valueA:  uniqueEmpTypes[0]!,
        valueB:  uniqueEmpTypes[1]!,
        rowIdA:  group[0]!.rowId,
        rowIdB:  group[1]!.rowId,
      })
    }
  }

  return issues
}
