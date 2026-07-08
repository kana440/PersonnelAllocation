import { type AllocationRow, isVacantRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'

/**
 * 管理者モード用: メンバー（userId あり）が属する全組織 ID の一覧を返す（重複なし）。
 */
export function getAllMemberOrgIds(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
): string[] {
  const codeToId = new Map(afterOrganizations.map(o => [o.externalCode ?? o.id, o.id]))
  const orgIdSet = new Set<string>()
  for (const row of allocationList) {
    if (isVacantRow(row) || !row.departmentCode) continue
    const orgId = codeToId.get(row.departmentCode)
    if (orgId) orgIdSet.add(orgId)
  }
  return [...orgIdSet]
}

/**
 * 比較モード（旧組織キャンバス）用: メンバー（userId あり）が旧組織コード上で属する
 * 全組織 ID の一覧を返す（重複なし）。getAllMemberOrgIds の旧組織版。
 */
export function getAllBeforeMemberOrgIds(
  allocationList:     AllocationRow[],
  beforeOrganizations: Organization[],
): string[] {
  const codeToId = new Map(beforeOrganizations.map(o => [o.externalCode ?? o.id, o.id]))
  const orgIdSet = new Set<string>()
  for (const row of allocationList) {
    if (isVacantRow(row) || !row.prevDepartmentCode) continue
    const orgId = codeToId.get(row.prevDepartmentCode)
    if (orgId) orgIdSet.add(orgId)
  }
  return [...orgIdSet]
}

/**
 * 担当者モード用: 担当者のメンバー（userId あり）が属する組織 ID の一覧を返す（重複なし）。
 * assigneeName === null は「担当者未設定」行を対象にする。
 */
export function getAssigneeOrgIds(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
  assigneeName: string | null,
): string[] {
  const codeToId = new Map(afterOrganizations.map(o => [o.externalCode ?? o.id, o.id]))
  const orgIdSet = new Set<string>()
  for (const row of allocationList) {
    const rowAssignee = row.assignee?.trim() ?? ''
    if (assigneeName === null ? rowAssignee !== '' : rowAssignee !== assigneeName) continue
    if (isVacantRow(row) || !row.departmentCode) continue
    const orgId = codeToId.get(row.departmentCode)
    if (orgId) orgIdSet.add(orgId)
  }
  return [...orgIdSet]
}

/**
 * memberOrgIds の各組織から祖先を辿り、実際に open:true になる組織（祖先含む・重複なし）の
 * ID 集合を返す。初回自動展開を有効にするかどうかの判定（開くことになる組織数が多すぎると
 * 描画がフリーズするため）に使う。
 */
export function collectExpandAncestorClosure(
  memberOrgIds: string[],
  orgById:      Map<string, Organization>,
): Set<string> {
  const closure = new Set<string>()
  for (const id of memberOrgIds) {
    let cur = orgById.get(id)
    while (cur && !closure.has(cur.id)) {
      closure.add(cur.id)
      cur = cur.parentId ? orgById.get(cur.parentId) : undefined
    }
  }
  return closure
}
