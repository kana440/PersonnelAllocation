import { useMemo } from 'react'
import { useStore } from './useStore'
import { deriveCapabilities } from '../application/userSession'

// Wraps useStore and returns allocation data filtered to the current scope.
//
// - 担当者ロール: capabilities.rowScope（担当者名）に一致する行のみ返す
// - 管理者ロール: adminAssigneeFilter（プレビュー）が設定されていればその行のみ返す
// - どちらも null の場合は全行を返す
//
// Operations (save, undo, etc.) still go through useStore/appService with full data.
export function useScopedStore() {
  const store = useStore()
  const {
    allocationList, afterOrganizations, beforeOrganizations, persons,
    userSession, adminAssigneeFilter,
  } = store

  const capabilities = useMemo(() => deriveCapabilities(userSession), [userSession])

  // ── 担当者ロール：自分の担当行のみ ───────────────────────────────────────────
  const scopedByAssignee = useMemo(() => {
    if (capabilities.rowScope === null) return null
    return allocationList.filter(r => r.assignee === capabilities.rowScope)
  }, [capabilities.rowScope, allocationList])

  // ── 管理者ロール：担当者プレビューフィルタ ───────────────────────────────────
  const scopedByAdminFilter = useMemo(() => {
    if (!capabilities.canSetAssigneeFilter || adminAssigneeFilter === null) return null
    return allocationList.filter(r => r.assignee === adminAssigneeFilter)
  }, [capabilities.canSetAssigneeFilter, adminAssigneeFilter, allocationList])

  // スコープ優先順位: 担当者ロール > 管理者プレビューフィルタ
  const scopedAllocationList = scopedByAssignee ?? scopedByAdminFilter ?? allocationList

  const scopedPersons = useMemo(() => {
    if (capabilities.rowScope === null && adminAssigneeFilter === null) return persons
    const sfIds = new Set(
      scopedAllocationList.map(r => r.userId).filter((id): id is string => Boolean(id))
    )
    return persons.filter(p => p.sfPersonId && sfIds.has(p.sfPersonId))
  }, [capabilities.rowScope, adminAssigneeFilter, scopedAllocationList, persons])

  // 担当者ロール時のワーニング情報（他担当者行・未割当行の存在を通知）
  const assigneeWarnings = useMemo(() => {
    if (capabilities.rowScope === null) return null
    const otherAssigneeRows = allocationList.filter(
      r => r.assignee !== capabilities.rowScope && r.assignee !== undefined && r.assignee !== ''
    )
    const unassignedRows = allocationList.filter(r => !r.assignee)
    return {
      otherAssigneeCount: otherAssigneeRows.length,
      unassignedCount:    unassignedRows.length,
      hasWarnings:        otherAssigneeRows.length > 0 || unassignedRows.length > 0,
    }
  }, [capabilities.rowScope, allocationList])

  return {
    ...store,
    allocationList:      scopedAllocationList,
    afterOrganizations,
    beforeOrganizations,
    organizations:       beforeOrganizations,
    persons:             scopedPersons,
    assigneeWarnings,
  }
}
