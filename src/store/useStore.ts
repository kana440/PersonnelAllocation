import { create } from 'zustand'
import type { AfterValues } from '../domain/allocationRow'
import type { ValidationResult } from '../domain/operation/types'
import { appService } from '../application/HRApplicationService'
import type { DomainSnapshot } from '../application/HRApplicationService'
import type { AllocationRow } from '../domain/allocationRow'

// 編集モードに入る前のビュー状態スナップショット
export interface PreviousViewState {
  viewLabel:        string        // 戻るボタンのラベル（例: '組織図'）
  focusedOrgId:     string | null
  selectedPersonId: string | null
}

// ── UI 専用状態 ───────────────────────────────────────────────────
interface UIState {
  isLoading:            boolean
  effectiveDate:        string
  overviewViewMode:     'before' | 'after'
  workspaceMode:        'empty' | 'org' | 'person'
  focusedOrgId:         string | null
  beforeFocusedOrgId:   string | null
  selectedPersonId:     string | null
  selectedRowId:        number | null   // 編集対象の AllocationRow
  personPickupViewMode: 'before' | 'after'
  memberPanelOrgId:     string | null
  editMode:             boolean
  previousViewState:    PreviousViewState | null
  mainCanvasMode:       '組織図' | 'レポートライン'
}

// ── アクション ────────────────────────────────────────────────────
interface Actions {
  // データロード
  loadExcelData: (result: import('../infrastructure/excelImport').ImportedWorkbookResult) => Promise<void>

  // 行の直接編集
  editRow:   (rowId: number, changes: AfterValues) => void
  saveRow:   (rowId: number, changes: AfterValues) => ValidationResult
  selectRow: (rowId: number | null) => void

  // 新規採用
  addNewHire: (opts: {
    name:            string
    employeeNumber?: string
    orgId?:          string
    companyId?:      string
  }) => void

  // Undo / Redo
  undo: () => void
  redo: () => void

  reset: () => void

  // UI
  setEffectiveDate:        (date: string) => void
  setOverviewViewMode:     (mode: 'before' | 'after') => void
  focusOrg:                (orgId: string) => void
  focusBefore:             (orgId: string) => void
  selectPerson:            (personId: string) => void
  clearPersonSelection:    () => void
  setPersonPickupViewMode: (mode: 'before' | 'after') => void
  setMemberPanelOrgId:     (orgId: string | null) => void

  // 編集モード
  enterEditMode:      (rowId: number) => void
  exitEditMode:       () => void
  setMainCanvasMode:  (mode: '組織図' | 'レポートライン') => void

  // 後方互換（既存コンポーネントが参照している場合のみ残す）
  setRawImportedRows: (rows: AllocationRow[]) => void
}

type AppState = DomainSnapshot & UIState & Actions

export const useStore = create<AppState>((set, get) => {
  appService.subscribe(() => set(appService.getSnapshot()))

  return {
    // ── ドメイン状態（HRApplicationService から同期）──────────────
    ...appService.getSnapshot(),

    // ── UI 専用状態 ──────────────────────────────────────────────
    isLoading:            true,
    effectiveDate:        '2025-04-01',
    overviewViewMode:     'before',
    workspaceMode:        'org',
    focusedOrgId:         null,
    beforeFocusedOrgId:   null,
    selectedPersonId:     null,
    selectedRowId:        null,
    personPickupViewMode: 'before',
    memberPanelOrgId:     null,
    editMode:             false,
    previousViewState:    null,
    mainCanvasMode:       '組織図',

    // ── アクション ────────────────────────────────────────────────
    loadExcelData: async (result) => {
      const { save } = await import('../store/codeListStore').then(m => ({ save: m.useCodeListStore.getState().save }))
      appService.loadExcelData({
        allocationList:      result.allocationList,
        beforeOrganizations: result.beforeOrganizations,
        afterOrganizations:  result.afterOrganizations,
        companies:           result.companies,
        codeLists:           result.codeLists,
      })
      await save(result.codeLists)
      set({ isLoading: false, selectedPersonId: null, selectedRowId: null, focusedOrgId: null })
    },

    editRow:   (rowId, changes) => appService.editRow(rowId, changes),
    saveRow:   (rowId, changes) => appService.saveRow(rowId, changes),

    selectRow: (rowId) => set({ selectedRowId: rowId }),

    addNewHire: ({ name, employeeNumber, orgId, companyId }) => {
      const { effectiveDate } = get()
      const userId = `new_${Date.now()}`
      const parts  = name.trim().split(/\s+/)
      appService.addNewHireRow({
        lastName:       parts[0] ?? name,
        firstName:      parts.slice(1).join(' '),
        userId,
        employeeNumber,
        departmentCode: orgId,
        companyId,
        effectiveDate,
      })
    },

    undo: () => appService.undo(),
    redo: () => appService.redo(),

    reset: () => {
      appService.reset()
      set({ selectedPersonId: null, selectedRowId: null, focusedOrgId: null, isLoading: false })
    },

    enterEditMode: (rowId) => {
      const { focusedOrgId, selectedPersonId, mainCanvasMode, allocationList, persons } = get()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row) return
      const person = persons.find(p => p.sfPersonId === row.userId)
      set({
        editMode:          true,
        previousViewState: { viewLabel: mainCanvasMode, focusedOrgId, selectedPersonId },
        selectedRowId:     rowId,
        selectedPersonId:  person?.id ?? selectedPersonId,
      })
    },

    exitEditMode: () => {
      const { previousViewState } = get()
      set({
        editMode:          false,
        selectedRowId:     null,
        focusedOrgId:      previousViewState?.focusedOrgId ?? null,
        selectedPersonId:  previousViewState?.selectedPersonId ?? null,
        previousViewState: null,
      })
    },

    setMainCanvasMode:  (mode) => set({ mainCanvasMode: mode }),

    setRawImportedRows: (_rows) => { /* no-op: 後方互換 */ },

    setEffectiveDate:        (date) => set({ effectiveDate: date }),
    setOverviewViewMode:     (mode) => set({ overviewViewMode: mode }),
    focusOrg:                (orgId) => set({ focusedOrgId: orgId, workspaceMode: 'org' }),
    focusBefore:             (orgId) => set({ beforeFocusedOrgId: orgId }),
    selectPerson:            (personId) => set({ selectedPersonId: personId, workspaceMode: 'person' }),
    clearPersonSelection:    () => set({ selectedPersonId: null, selectedRowId: null }),
    setPersonPickupViewMode: (mode) => set({ personPickupViewMode: mode }),
    setMemberPanelOrgId:     (orgId) => set({ memberPanelOrgId: orgId }),
  }
})
