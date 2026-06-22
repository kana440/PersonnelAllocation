import { createContext, useContext } from 'react'
import type { Organization, Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface BeforeOrgViewContextValue {
  beforeOrganizations:  Organization[]
  /** orgId → その org に prevDepartmentCode で紐付く rows */
  beforeRowsByOrgId:    Map<string, AllocationRow[]>
  afterOrganizations:   Organization[]
  /** beforeOrgId → afterOrgId のマッピング */
  comparisonOrgMapping: Record<string, string>
  persons:              Person[]
  selectedIds:          Set<string>
  toggleSelect:         (userId: string, ctrl: boolean) => void
  clearSelect:          () => void
}

export const BeforeOrgViewContext = createContext<BeforeOrgViewContextValue | null>(null)

export function useBeforeOrgView(): BeforeOrgViewContextValue {
  const ctx = useContext(BeforeOrgViewContext)
  if (!ctx) throw new Error('useBeforeOrgView must be inside BeforeOrgViewContext.Provider')
  return ctx
}

