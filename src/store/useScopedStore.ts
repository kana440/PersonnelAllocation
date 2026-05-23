import { useMemo } from 'react'
import { useStore } from './useStore'
import { getDescendantOrgIds, filterRowsByScope } from '../domain/orgScope'

// Wraps useStore and returns allocation data filtered to the current scope.
// When scopeOrgId is null, all data is returned as-is.
// Use this hook in display components (canvas, sidebar, excel preview).
// Operations (save, undo, etc.) still go through useStore/appService with full data.
export function useScopedStore() {
  const store = useStore()
  const { allocationList, afterOrganizations, beforeOrganizations, persons, scopeOrgId } = store

  const scopedAfterOrgs = useMemo(() => {
    if (!scopeOrgId) return afterOrganizations
    const ids = getDescendantOrgIds(scopeOrgId, afterOrganizations)
    return afterOrganizations.filter(o => ids.has(o.id))
  }, [scopeOrgId, afterOrganizations])

  const scopedBeforeOrgs = useMemo(() => {
    if (!scopeOrgId) return beforeOrganizations
    const ids        = getDescendantOrgIds(scopeOrgId, afterOrganizations)
    const scopeCodes = new Set(
      afterOrganizations.filter(o => ids.has(o.id) && o.externalCode).map(o => o.externalCode as string)
    )
    return beforeOrganizations.filter(o => o.externalCode && scopeCodes.has(o.externalCode))
  }, [scopeOrgId, afterOrganizations, beforeOrganizations])

  const scopedAllocationList = useMemo(
    () => filterRowsByScope(allocationList, scopeOrgId, afterOrganizations),
    [allocationList, scopeOrgId, afterOrganizations]
  )

  // Filter persons to only those with at least one row in scope.
  // Without this, people outside the scope show up as "所属なし".
  const scopedPersons = useMemo(() => {
    if (!scopeOrgId) return persons
    const sfIds = new Set(
      scopedAllocationList.map(r => r.userId).filter((id): id is string => Boolean(id))
    )
    return persons.filter(p => p.sfPersonId && sfIds.has(p.sfPersonId))
  }, [scopeOrgId, scopedAllocationList, persons])

  return {
    ...store,
    allocationList:      scopedAllocationList,
    afterOrganizations:  scopedAfterOrgs,
    beforeOrganizations: scopedBeforeOrgs,
    organizations:       scopedBeforeOrgs,   // alias used by some components
    persons:             scopedPersons,
  }
}
