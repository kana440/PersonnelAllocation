import type { AllocationRow } from '../allocationRow'
import type { ValidationIssue } from './types'

// E系: キー重複・参照整合チェック（noCheckRequired でも実行される）

/** E1: 上司ポジションコードの存在・自己参照・循環チェック */
function checkManagerPositionCode(row: AllocationRow, allRows: AllocationRow[]): ValidationIssue[] {
  const mgrCode = row.managerPositionCode
  if (!mgrCode || !allRows.length) return []

  const mgrRow = allRows.find(r => r.positionCode === mgrCode)
  if (!mgrRow)
    // ファイル分割運用では上司が別 Excel に存在するため warning に留める（保存はブロックしない）
    return [{ field: 'managerPositionCode', level: 'warning', message: `上司ポジションコード "${mgrCode}" がこのファイルに存在しません（別組織の可能性あり）` }]

  if (row.positionCode && mgrCode === row.positionCode)
    return [{ field: 'managerPositionCode', level: 'error', message: '自分自身を上司ポジションに設定できません' }]

  if (row.positionCode) {
    const posToMgr = new Map<string, string>()
    for (const r of allRows) {
      if (r.positionCode && r.managerPositionCode) posToMgr.set(r.positionCode, r.managerPositionCode)
    }
    let cur: string | undefined = posToMgr.get(mgrCode)
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      if (cur === row.positionCode)
        return [{ field: 'managerPositionCode', level: 'error', message: '配下のポジションを上司に設定できません（循環参照）' }]
      cur = posToMgr.get(cur)
    }
  }

  return []
}

export function runExclusivity(row: AllocationRow, allRows: AllocationRow[]): ValidationIssue[] {
  return [
    ...checkManagerPositionCode(row, allRows),
  ]
}
