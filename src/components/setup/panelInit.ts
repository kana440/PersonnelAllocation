import type { AllocationRow } from '../../domain/allocationRow'
import type { Organization } from '../../domain/schemas'

/**
 * 担当者モード用: 担当組織の「直属メンバーがいる最上位祖先」にまとめて人数降順で最大 maxPanels 件返す。
 * usePanelCoverage.ts の候補計算と同じアルゴリズム（covered なし版）。
 * assigneeName === null は「担当者未設定」行を対象にする。
 */
export function computeAssigneePanelOrgIds(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
  assigneeName: string | null,
  maxPanels = 8,
): string[] {
  const codeToId = new Map(afterOrganizations.map(o => [o.externalCode ?? o.id, o.id]))
  const orgById  = new Map(afterOrganizations.map(o => [o.id, o]))

  // 担当者の行に絞り込んで直属メンバー数を集計
  const directByOrg = new Map<string, number>()
  for (const row of allocationList) {
    const rowAssignee = row.assignee?.trim() ?? ''
    if (assigneeName === null ? rowAssignee !== '' : rowAssignee !== assigneeName) continue
    if (!row.userId || !row.departmentCode) continue
    const orgId = codeToId.get(row.departmentCode)
    if (!orgId) continue
    directByOrg.set(orgId, (directByOrg.get(orgId) ?? 0) + 1)
  }
  if (directByOrg.size === 0) return []

  // 各 org の「直属メンバーがいる最上位祖先」を求める（usePanelCoverage と同じロジック）
  const topByOrg = new Map<string, string>()
  for (const orgId of directByOrg.keys()) {
    let top = orgId
    let cur = orgById.get(orgId)
    while (cur?.parentId) {
      const parent = orgById.get(cur.parentId)
      if (!parent) break
      if (directByOrg.has(parent.id)) top = parent.id
      cur = parent
    }
    topByOrg.set(orgId, top)
  }

  // top org ごとに人数を合算して降順、最大 maxPanels 件
  const totalByTop = new Map<string, number>()
  for (const [orgId, count] of directByOrg) {
    const top = topByOrg.get(orgId)!
    totalByTop.set(top, (totalByTop.get(top) ?? 0) + count)
  }
  return [...totalByTop.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPanels)
    .map(([orgId]) => orgId)
}

/**
 * 管理者モード用: 人が存在する全組織の最低共通祖先 (LCA) の org ID を返す。
 * 組織が1つならそのまま返す。複数あれば上位へ辿って合流点を探す。
 */
export function findCommonAncestorOrgId(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
): string | null {
  const orgById = new Map(afterOrganizations.map(o => [o.id, o]))
  const codeToId = new Map(
    afterOrganizations.map(o => [o.externalCode ?? o.id, o.id]),
  )
  const relevantIds = new Set<string>()
  for (const row of allocationList) {
    if (!row.userId || !row.departmentCode) continue
    const orgId = codeToId.get(row.departmentCode)
    if (orgId) relevantIds.add(orgId)
  }
  if (relevantIds.size === 0) return null
  if (relevantIds.size === 1) return [...relevantIds][0]

  const getPath = (orgId: string): string[] => {
    const path: string[] = []
    let cur = orgById.get(orgId)
    while (cur) {
      path.unshift(cur.id)
      cur = cur.parentId ? orgById.get(cur.parentId) : undefined
    }
    return path
  }

  const paths = [...relevantIds].map(id => getPath(id))
  const [first, ...rest] = paths
  let lcaIdx = -1
  for (let i = 0; i < first.length; i++) {
    if (rest.every(p => p[i] === first[i])) lcaIdx = i
    else break
  }
  return lcaIdx >= 0 ? first[lcaIdx] : null
}
