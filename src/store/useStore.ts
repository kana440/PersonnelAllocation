import { create } from 'zustand'
import type { Operation } from '../domain/schemas'
import type { Repositories } from '../ports'
import { appService } from '../application/HRApplicationService'
import type { DomainSnapshot } from '../application/HRApplicationService'

// ── UI専用状態 ───────────────────────────────────────────────────
interface UIState {
  isLoading:             boolean
  effectiveDate:         string
  overviewViewMode:      'before' | 'after'
  workspaceMode:         'empty' | 'org' | 'person'
  focusedOrgId:          string | null
  beforeFocusedOrgId:    string | null
  selectedPersonId:      string | null
  personPickupViewMode:  'before' | 'after'
  memberPanelOrgId:      string | null
  confirmedNoChangeKeys: Set<string>
}

// ── アクション ───────────────────────────────────────────────────
interface Actions {
  loadData:    (repos: Repositories) => Promise<void>
  addOperation:    (op: Omit<Operation, 'id' | 'order'>) => void
  removeOperation: (id: string) => void
  confirmNoChange: (personId: string, companyId: string) => void
  setEffectiveDate:        (date: string) => void
  setOverviewViewMode:     (mode: 'before' | 'after') => void
  focusOrg:                (orgId: string) => void
  focusBefore:             (orgId: string) => void
  selectPerson:            (personId: string) => void
  clearPersonSelection:    () => void
  setPersonPickupViewMode: (mode: 'before' | 'after') => void
  setMemberPanelOrgId:     (orgId: string | null) => void
  loadBaseState: (data: {
    persons:       import('../domain/schemas').Person[]
    companies:     import('../domain/schemas').Company[]
    organizations: import('../domain/schemas').Organization[]
    affiliations:  import('../domain/schemas').Affiliation[]
    positions:     import('../domain/schemas').Position[]
  }) => void
}

type AppState = DomainSnapshot & UIState & Actions

export const useStore = create<AppState>((set) => {
  // HRApplicationService の変更をZustandに同期する
  // UI専用フィールドは上書きされないため、set のマージ挙動で安全
  appService.subscribe(() => set(appService.getSnapshot()))

  return {
    // ── ドメイン状態（HRApplicationService から同期）─────────────
    ...appService.getSnapshot(),

    // ── UI専用状態 ───────────────────────────────────────────────
    isLoading:             true,
    effectiveDate:         '2025-04-01',
    overviewViewMode:      'before',
    workspaceMode:         'org',
    focusedOrgId:          'org_a_keiei',
    beforeFocusedOrgId:    'org_a_keiei',
    selectedPersonId:      'p_yamada',
    personPickupViewMode:  'before',
    memberPanelOrgId:      'org_a_kikaku',
    confirmedNoChangeKeys: new Set<string>(),

    // ── アクション ───────────────────────────────────────────────
    loadData: async (repos) => {
      await appService.initialize(repos)
      set({ isLoading: false })
    },

    addOperation: (op) => {
      appService.addOperation(op)
      // confirmedNoChangeKeys はUI状態なのでここで更新する
      const personId  = op.params.personId
      const companyId = op.params.companyId ?? op.params.toCompanyId ?? ''
      if (personId) {
        set(state => ({
          confirmedNoChangeKeys: new Set([...state.confirmedNoChangeKeys, `${personId}_${companyId}`]),
        }))
      }
    },

    removeOperation: (id) => appService.removeOperation(id),

    confirmNoChange: (personId, companyId) =>
      set(state => ({
        confirmedNoChangeKeys: new Set([...state.confirmedNoChangeKeys, `${personId}_${companyId}`]),
      })),

    loadBaseState: (data) => {
      appService.loadBaseState(data)
      set({ confirmedNoChangeKeys: new Set(), selectedPersonId: null, focusedOrgId: null })
    },

    setEffectiveDate:        (date) => set({ effectiveDate: date }),
    setOverviewViewMode:     (mode) => set({ overviewViewMode: mode }),
    focusOrg:                (orgId) => set({ focusedOrgId: orgId, workspaceMode: 'org' }),
    focusBefore:             (orgId) => set({ beforeFocusedOrgId: orgId }),
    selectPerson:            (personId) => set({ selectedPersonId: personId }),
    clearPersonSelection:    () => set({ selectedPersonId: null }),
    setPersonPickupViewMode: (mode) => set({ personPickupViewMode: mode }),
    setMemberPanelOrgId:     (orgId) => set({ memberPanelOrgId: orgId }),
  }
})
