import type { AllocationRow } from '@personnel/domain/allocationRow'

export type ImportMode = 'replace-all' | 'append-new'

// 担当者情報の取り扱い
// overwrite: インポートファイルの担当者をそのまま使う
// preserve:  既存行に担当者が設定済みならそれを維持し、インポートの担当者で上書きしない
export type AssigneeImportMode = 'overwrite' | 'preserve'

export interface MergeResult {
  rows:    AllocationRow[]
  added:   number
  kept:    number
  removed: number
}

export function mergeAllocationList(opts: {
  existing:         AllocationRow[]
  incoming:         AllocationRow[]
  mode:             ImportMode
  assigneeMode:     AssigneeImportMode
}): MergeResult {
  const { existing, incoming, mode, assigneeMode } = opts
  const maxExistingId = existing.length > 0 ? Math.max(...existing.map(r => r.rowId)) : 0

  if (mode === 'replace-all') {
    let rows = incoming.map((r, i) => ({ ...r, rowId: i + 1 }))
    if (assigneeMode === 'preserve') {
      // 既存行の担当者を rowKey(groupEmployeeId + departmentCode) でマップ化
      const existingAssigneeMap = buildExistingAssigneeMap(existing)
      rows = rows.map(r => {
        const key = rowKey(r)
        const existingAssignee = key ? existingAssigneeMap.get(key) : undefined
        if (existingAssignee !== undefined) return { ...r, assignee: existingAssignee }
        return r
      })
    }
    return { rows, added: rows.length, kept: 0, removed: existing.length }
  }

  // append-new: add only rows not already present (by groupEmployeeId + departmentCode)
  const existingKeys = new Set(
    existing.filter(r => r.groupEmployeeId).map(r => rowKey(r)!)
  )

  let nextId = maxExistingId + 1
  const rowsToAdd: AllocationRow[] = []
  for (const r of incoming) {
    const key = rowKey(r)
    if (!key || !existingKeys.has(key)) {
      rowsToAdd.push({ ...r, rowId: nextId++ })
    }
  }

  return {
    rows:    [...existing, ...rowsToAdd],
    added:   rowsToAdd.length,
    kept:    existing.length,
    removed: 0,
  }
}

function rowKey(r: AllocationRow): string | null {
  if (!r.groupEmployeeId) return null
  return `${r.groupEmployeeId}|${r.departmentCode ?? ''}`
}

function buildExistingAssigneeMap(existing: AllocationRow[]): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>()
  for (const r of existing) {
    const key = rowKey(r)
    if (key) map.set(key, r.assignee)
  }
  return map
}
