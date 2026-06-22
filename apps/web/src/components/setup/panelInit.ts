import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'

/**
 * ルート組織（親を持たない組織）の ID 一覧を返す。管理者モードの初期パネル構築に使う。
 */
export function getRootOrgIds(afterOrganizations: Organization[]): string[] {
  const orgIds = new Set(afterOrganizations.map(o => o.id))
  return afterOrganizations
    .filter(o => !o.parentId || !orgIds.has(o.parentId))
    .map(o => o.id)
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
    if (!row.userId || !row.departmentCode) continue
    const orgId = codeToId.get(row.departmentCode)
    if (orgId) orgIdSet.add(orgId)
  }
  return [...orgIdSet]
}
