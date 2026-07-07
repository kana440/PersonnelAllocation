import { type AllocationRow, isVacantRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'

// TODO(検証用・一時的): 仮想化後に「配下に人がいる組織を初回から自動展開」が
// パフォーマンス的に問題ないか比較検証するためだけに復活させた関数。
// 検証が終わったら SetupView.tsx の呼び出し側ごと削除すること。
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
