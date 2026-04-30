import { create } from 'zustand'
import type { Company, Organization, Person, Position, Affiliation, Operation } from '../types/domain'
import { companies, organizations, persons, beforePositions, beforeAffiliations, initialOperations } from '../data/mockData'
import { applyOperations } from './applyOperations'

interface AppState {
  // Master data (read-only)
  companies: Company[]
  organizations: Organization[]
  persons: Person[]
  // Before state
  beforePositions: Position[]
  beforeAffiliations: Affiliation[]
  // Operations
  operations: Operation[]
  // Derived after state
  afterPositions: Position[]
  afterAffiliations: Affiliation[]
  // UI state
  effectiveDate: string
  overviewViewMode: 'before' | 'after'
  workspaceMode: 'empty' | 'org' | 'person'
  focusedOrgId: string | null
  selectedPersonId: string | null
  personPickupViewMode: 'before' | 'after'
  memberPanelOrgId: string | null
  // Actions
  addOperation: (op: Omit<Operation, 'id' | 'order'>) => void
  removeOperation: (id: string) => void
  setEffectiveDate: (date: string) => void
  setOverviewViewMode: (mode: 'before' | 'after') => void
  focusOrg: (orgId: string) => void
  selectPerson: (personId: string) => void
  clearPersonSelection: () => void
  setPersonPickupViewMode: (mode: 'before' | 'after') => void
  setMemberPanelOrgId: (orgId: string | null) => void
}

function computeAfterState(
  beforeAffs: Affiliation[],
  beforePos: Position[],
  ops: Operation[],
  orgs: Organization[]
) {
  return applyOperations(beforeAffs, beforePos, ops, orgs)
}

export const useStore = create<AppState>((set, get) => {
  const initial = computeAfterState(beforeAffiliations, beforePositions, initialOperations, organizations)
  return {
    companies,
    organizations,
    persons,
    beforePositions,
    beforeAffiliations,
    operations: initialOperations,
    afterPositions: initial.positions,
    afterAffiliations: initial.affiliations,
    effectiveDate: '2025-04-01',
    overviewViewMode: 'before',
    workspaceMode: 'org',
    focusedOrgId: 'org_a_keiei',
    selectedPersonId: 'p_yamada',
    personPickupViewMode: 'before',
    memberPanelOrgId: 'org_a_kikaku',

    addOperation: (op) => {
      const ops = get().operations
      const newOp: Operation = { ...op, id: `op_${Date.now()}`, order: ops.length + 1 }
      const newOps = [...ops, newOp]
      const after = computeAfterState(get().beforeAffiliations, get().beforePositions, newOps, get().organizations)
      set({ operations: newOps, afterPositions: after.positions, afterAffiliations: after.affiliations })
    },

    removeOperation: (id) => {
      const newOps = get().operations.filter(o => o.id !== id).map((o, i) => ({ ...o, order: i + 1 }))
      const after = computeAfterState(get().beforeAffiliations, get().beforePositions, newOps, get().organizations)
      set({ operations: newOps, afterPositions: after.positions, afterAffiliations: after.affiliations })
    },

    setEffectiveDate: (date) => set({ effectiveDate: date }),
    setOverviewViewMode: (mode) => set({ overviewViewMode: mode }),
    focusOrg: (orgId) => set({ focusedOrgId: orgId, workspaceMode: 'org' }),
    selectPerson: (personId) => set({ selectedPersonId: personId }),
    clearPersonSelection: () => set({ selectedPersonId: null }),
    setPersonPickupViewMode: (mode) => set({ personPickupViewMode: mode }),
    setMemberPanelOrgId: (orgId) => set({ memberPanelOrgId: orgId }),
  }
})
