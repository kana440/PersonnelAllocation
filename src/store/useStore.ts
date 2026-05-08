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
  afterOrganizations: Organization[]
  // UI state
  effectiveDate: string
  overviewViewMode: 'before' | 'after'
  workspaceMode: 'empty' | 'org' | 'person'
  focusedOrgId: string | null
  beforeFocusedOrgId: string | null
  selectedPersonId: string | null
  personPickupViewMode: 'before' | 'after'
  memberPanelOrgId: string | null
  // Confirmation tracking (Before panel)
  confirmedNoChangeKeys: Set<string>   // `${personId}_${companyId}`
  // Actions
  addOperation: (op: Omit<Operation, 'id' | 'order'>) => void
  removeOperation: (id: string) => void
  confirmNoChange: (personId: string, companyId: string) => void
  setEffectiveDate: (date: string) => void
  setOverviewViewMode: (mode: 'before' | 'after') => void
  focusOrg: (orgId: string) => void
  focusBefore: (orgId: string) => void
  selectPerson: (personId: string) => void
  clearPersonSelection: () => void
  setPersonPickupViewMode: (mode: 'before' | 'after') => void
  setMemberPanelOrgId: (orgId: string | null) => void
  loadBaseState: (data: {
    persons: Person[]
    companies: Company[]
    organizations: Organization[]
    affiliations: Affiliation[]
    positions: Position[]
  }) => void
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
    afterOrganizations: initial.organizations,
    effectiveDate: '2025-04-01',
    overviewViewMode: 'before',
    workspaceMode: 'org',
    focusedOrgId: 'org_a_keiei',
    beforeFocusedOrgId: 'org_a_keiei',
    selectedPersonId: 'p_yamada',
    personPickupViewMode: 'before',
    memberPanelOrgId: 'org_a_kikaku',
    confirmedNoChangeKeys: new Set<string>(),

    addOperation: (op) => {
      let ops = get().operations

      if (op.kind === 'MoveToOrg') {
        ops = ops.filter(o => !(
          o.kind === 'MoveToOrg' &&
          o.params.personId === op.params.personId &&
          o.params.companyId === op.params.companyId
        ))
      } else if (op.kind === 'Promote') {
        ops = ops.filter(o => !(
          o.kind === 'Promote' &&
          o.params.personId === op.params.personId &&
          o.params.companyId === op.params.companyId
        ))
      } else if (op.kind === 'RecallFromSecondment') {
        const sendOp = ops.find(o =>
          o.kind === 'SendOnSecondment' &&
          o.params.personId === op.params.personId &&
          o.params.toCompanyId === op.params.companyId
        )
        if (sendOp) {
          const cancelledOps = ops.filter(o => o.id !== sendOp.id).map((o, i) => ({ ...o, order: i + 1 }))
          const after = computeAfterState(get().beforeAffiliations, get().beforePositions, cancelledOps, get().organizations)
          set({ operations: cancelledOps, afterPositions: after.positions, afterAffiliations: after.affiliations, afterOrganizations: after.organizations })
          return
        }
      } else if (op.kind === 'AddConcurrent') {
        const removeOp = ops.find(o =>
          o.kind === 'RemoveConcurrent' &&
          o.params.personId === op.params.personId &&
          o.params.orgId === op.params.orgId
        )
        if (removeOp) {
          const cancelledOps = ops.filter(o => o.id !== removeOp.id).map((o, i) => ({ ...o, order: i + 1 }))
          const after = computeAfterState(get().beforeAffiliations, get().beforePositions, cancelledOps, get().organizations)
          set({ operations: cancelledOps, afterPositions: after.positions, afterAffiliations: after.affiliations, afterOrganizations: after.organizations })
          return
        }
      } else if (op.kind === 'RemoveConcurrent') {
        const addOp = ops.find(o =>
          o.kind === 'AddConcurrent' &&
          o.params.personId === op.params.personId &&
          o.params.orgId === op.params.orgId
        )
        if (addOp) {
          const cancelledOps = ops.filter(o => o.id !== addOp.id).map((o, i) => ({ ...o, order: i + 1 }))
          const after = computeAfterState(get().beforeAffiliations, get().beforePositions, cancelledOps, get().organizations)
          set({ operations: cancelledOps, afterPositions: after.positions, afterAffiliations: after.affiliations, afterOrganizations: after.organizations })
          return
        }
      }

      const newOp: Operation = { ...op, id: `op_${Date.now()}`, order: ops.length + 1 }
      const newOps = [...ops, newOp].map((o, i) => ({ ...o, order: i + 1 }))
      const after = computeAfterState(get().beforeAffiliations, get().beforePositions, newOps, get().organizations)
      const personId  = op.params.personId
      const companyId = op.params.companyId ?? op.params.toCompanyId ?? ''
      const newConfirmed = personId
        ? new Set([...get().confirmedNoChangeKeys, `${personId}_${companyId}`])
        : get().confirmedNoChangeKeys
      set({ operations: newOps, afterPositions: after.positions, afterAffiliations: after.affiliations, afterOrganizations: after.organizations, confirmedNoChangeKeys: newConfirmed })
    },

    removeOperation: (id) => {
      const newOps = get().operations.filter(o => o.id !== id).map((o, i) => ({ ...o, order: i + 1 }))
      const after = computeAfterState(get().beforeAffiliations, get().beforePositions, newOps, get().organizations)
      set({ operations: newOps, afterPositions: after.positions, afterAffiliations: after.affiliations, afterOrganizations: after.organizations })
    },

    confirmNoChange: (personId, companyId) =>
      set(state => ({ confirmedNoChangeKeys: new Set([...state.confirmedNoChangeKeys, `${personId}_${companyId}`]) })),

    setEffectiveDate: (date) => set({ effectiveDate: date }),
    setOverviewViewMode: (mode) => set({ overviewViewMode: mode }),
    focusOrg: (orgId) => set({ focusedOrgId: orgId, workspaceMode: 'org' }),
    focusBefore: (orgId) => set({ beforeFocusedOrgId: orgId }),
    selectPerson: (personId) => set({ selectedPersonId: personId }),
    clearPersonSelection: () => set({ selectedPersonId: null }),
    setPersonPickupViewMode: (mode) => set({ personPickupViewMode: mode }),
    setMemberPanelOrgId: (orgId) => set({ memberPanelOrgId: orgId }),

    loadBaseState: (data) => {
      const after = computeAfterState(data.affiliations, data.positions, [], data.organizations)
      set({
        persons:            data.persons,
        companies:          data.companies,
        organizations:      data.organizations,
        beforeAffiliations: data.affiliations,
        beforePositions:    data.positions,
        operations:         [],
        afterPositions:     after.positions,
        afterAffiliations:  after.affiliations,
        afterOrganizations: after.organizations,
        confirmedNoChangeKeys: new Set(),
        selectedPersonId:   null,
        focusedOrgId:       null,
      })
    },
  }
})
