import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

/**
 * ポジションコードとマネージャーポジションコードの関係から、行を DFS 順に並べて depth を付与する。
 * after (positionCode/managerPositionCode) と before (prevPositionCode/prevManagerPositionCode) の
 * 両方で使えるよう accessor を受け取る。
 */
export function buildPositionDepthList(
  rows:       AllocationRow[],
  getPosCode: (row: AllocationRow) => string | undefined,
  getMgrCode: (row: AllocationRow) => string | undefined,
): Array<{ row: AllocationRow; depth: number }> {
  const childrenByMgrCode = new Map<string, AllocationRow[]>()
  const inOrgPosCodes     = new Set<string>()
  for (const row of rows) {
    const pos = getPosCode(row)
    if (pos) inOrgPosCodes.add(pos)
    const mgr = getMgrCode(row)
    if (mgr) {
      const arr = childrenByMgrCode.get(mgr)
      if (arr) arr.push(row)
      else childrenByMgrCode.set(mgr, [row])
    }
  }
  const rootRows = rows.filter(r => { const mgr = getMgrCode(r); return !mgr || !inOrgPosCodes.has(mgr) })
  const result:  Array<{ row: AllocationRow; depth: number }> = []
  const visited = new Set<number>()
  const visit = (row: AllocationRow, depth: number) => {
    if (visited.has(row.rowId)) return
    visited.add(row.rowId)
    result.push({ row, depth })
    const pos = getPosCode(row)
    if (pos) {
      for (const c of (childrenByMgrCode.get(pos) ?? []))
        if (c.rowId !== row.rowId) visit(c, depth + 1)
    }
  }
  rootRows.forEach(r => visit(r, 0))
  for (const row of rows) if (!visited.has(row.rowId)) result.push({ row, depth: 0 })
  return result
}

/** 子孫 orgId 一覧（行を持つ org のみ）。directOnly=true で直接の子のみ */
export function getDescendantOrgIds(
  rootId:    string,
  orgs:      Organization[],
  hasRows:   (orgId: string) => boolean,
  directOnly = false,
): string[] {
  const direct = orgs.filter(o => o.parentId === rootId && hasAnyRows(o.id, orgs, hasRows))
  if (directOnly) return direct.map(o => o.id)
  const result: string[] = []
  for (const child of direct) {
    result.push(child.id)
    result.push(...getDescendantOrgIds(child.id, orgs, hasRows))
  }
  return result
}

/** org またはその子孫に行が存在するかを判定 */
export function hasAnyRows(
  orgId:         string,
  organizations: Organization[],
  hasRows:       (orgId: string) => boolean,
): boolean {
  if (hasRows(orgId)) return true
  return organizations.filter(o => o.parentId === orgId).some(c => hasAnyRows(c.id, organizations, hasRows))
}

/** サブツリー内の行数合計 */
export function subtreeRowCount(
  orgId:         string,
  organizations: Organization[],
  getCount:      (orgId: string) => number,
): number {
  const direct   = getCount(orgId)
  const children = organizations.filter(o => o.parentId === orgId)
  return direct + children.reduce((sum, c) => sum + subtreeRowCount(c.id, organizations, getCount), 0)
}

// ── 行カード共通ヘルパー ─────────────────────────────────────────────

export const isInternalPosCode = (s?: string): boolean => !s || s.startsWith('_pos_')

export function getPositionTitle(row: AllocationRow): string {
  return row.localJobTitle ??
    row.officialPositionCode ??
    (isInternalPosCode(row.positionCode) ? undefined : row.positionCode) ??
    ''
}

export function getBeforePositionTitle(row: AllocationRow): string {
  return row.prevLocalJobTitle ??
    row.prevOfficialPositionCode ??
    (isInternalPosCode(row.prevPositionCode) ? undefined : row.prevPositionCode) ??
    ''
}

export function getEmpBorderClass(
  row:      AllocationRow,
  empTypes: Array<{ label: string; isRegularEmployee: boolean; isSecondmentAcceptance: boolean }>,
): string {
  if (!row.userId) return 'border-l-gray-200'
  const entry = empTypes.find(e => e.label === row.employmentType)
  if (!entry) return row.employmentType ? 'border-l-amber-400' : 'border-l-gray-300'
  if (entry.isRegularEmployee)      return 'border-l-blue-500'
  if (entry.isSecondmentAcceptance) return 'border-l-teal-500'
  return 'border-l-amber-400'
}
