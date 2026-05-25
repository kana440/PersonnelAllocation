import { useMemo } from 'react'
import { useStore } from './useStore'
import { getDescendantOrgIds } from '../domain/orgScope'

// Wraps useStore and returns allocation data filtered to the current scope.
// Scope is defined as a before-org subtree (beforeScopeOrgId).
// When beforeScopeOrgId is null, all data is returned as-is.
// Use this hook in display components (canvas, sidebar, excel preview).
// Operations (save, undo, etc.) still go through useStore/appService with full data.
export function useScopedStore() {
  const store = useStore()
  const {
    allocationList, afterOrganizations, beforeOrganizations, persons,
    beforeScopeOrgId, afterScopeOrgIds,
  } = store

  // after-org IDs in scope (pre-computed by setScopeWithMapping)
  const afterScopeIdSet = useMemo(
    () => new Set(afterScopeOrgIds),
    [afterScopeOrgIds]
  )

  const scopedAfterOrgs = useMemo(() => {
    if (!beforeScopeOrgId) return afterOrganizations
    return afterOrganizations.filter(o => afterScopeIdSet.has(o.id))
  }, [beforeScopeOrgId, afterScopeIdSet, afterOrganizations])

  const scopedBeforeOrgs = useMemo(() => {
    if (!beforeScopeOrgId) return beforeOrganizations
    const ids = getDescendantOrgIds(beforeScopeOrgId, beforeOrganizations)
    return beforeOrganizations.filter(o => ids.has(o.id))
  }, [beforeScopeOrgId, beforeOrganizations])

  const scopedAllocationList = useMemo(() => {
    if (!beforeScopeOrgId) return allocationList

    const afterExtCodes = new Set(
      afterOrganizations.filter(o => afterScopeIdSet.has(o.id) && o.externalCode)
        .map(o => o.externalCode!)
    )
    const beforeIds = getDescendantOrgIds(beforeScopeOrgId, beforeOrganizations)
    const beforeExtCodes = new Set(
      beforeOrganizations.filter(o => beforeIds.has(o.id) && o.externalCode)
        .map(o => o.externalCode!)
    )
    // after-dept が scope 内、または before-dept が scope 内（異動元も含む）
    return allocationList.filter(r =>
      (r.departmentCode     && afterExtCodes.has(r.departmentCode)) ||
      (r.prevDepartmentCode && beforeExtCodes.has(r.prevDepartmentCode))
    )
  }, [beforeScopeOrgId, afterScopeIdSet, allocationList, afterOrganizations, beforeOrganizations])

  const scopedPersons = useMemo(() => {
    if (!beforeScopeOrgId) return persons
    const sfIds = new Set(
      scopedAllocationList.map(r => r.userId).filter((id): id is string => Boolean(id))
    )
    return persons.filter(p => p.sfPersonId && sfIds.has(p.sfPersonId))
  }, [beforeScopeOrgId, scopedAllocationList, persons])

  return {
    ...store,
    allocationList:      scopedAllocationList,
    afterOrganizations:  scopedAfterOrgs,
    beforeOrganizations: scopedBeforeOrgs,
    organizations:       scopedBeforeOrgs,
    persons:             scopedPersons,
  }
}
