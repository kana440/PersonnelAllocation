import { createContext, useContext } from 'react'
import type { Organization, Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export interface BeforeOrgViewContextValue {
  beforeOrganizations:  Organization[]
  /** orgId → その org に prevDepartmentCode で紐付く rows */
  beforeRowsByOrgId:    Map<string, AllocationRow[]>
  /** O(1) ルックアップ用。orgId → 直接の子 Organization[]（全 BeforeTreeWindow が共有） */
  childrenByOrgId:      Map<string, Organization[]>
  /** orgId → サブツリー全体の行数。O(N) で1回構築し全 BeforeTreeWindow が O(1) で参照 */
  beforeSubtreeCountByOrgId: Map<string, number>
  /** id → Organization（before 側）。BeforeTreeNode 等の O(1) ルックアップ用 */
  beforeOrgById:        Map<string, Organization>
  /** externalCode/id → Organization（after 側）。BeforeRowCard の移動先解決を O(1) にする共有 Map */
  afterOrgMap:          Map<string, Organization>
  /** sfPersonId → Person。BeforeRowCard の在籍者解決を O(1) にする共有 Map */
  personBySfId:         Map<string, Person>
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

