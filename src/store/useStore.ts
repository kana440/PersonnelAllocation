import { create } from 'zustand'
import type { AfterValues } from '../domain/allocationRow'
import type { ValidationResult } from '../domain/operation/types'
import { appService } from '../application/HRApplicationService'
import type { DomainSnapshot } from '../application/HRApplicationService'
import type { AllocationRow } from '../domain/allocationRow'
import type { Organization } from '../domain/schemas'

// ── org ナビゲーションヘルパー（ストアアクション用）───────────────
function buildIdMap(orgs: Organization[]): Map<string, Organization> {
  return new Map(orgs.map(o => [o.id, o]))
}

function isDescendantOf(orgId: string, ancestorId: string, map: Map<string, Organization>): boolean {
  let cur = map.get(orgId)
  while (cur) {
    if (cur.id === ancestorId) return true
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return false
}

// fromId の子孫 toId への経路（fromId 除く、toId 含む、上から下順）
function pathBetween(fromId: string, toId: string, map: Map<string, Organization>): string[] {
  const path: string[] = []
  let cur = map.get(toId)
  while (cur && cur.id !== fromId) {
    path.push(cur.id)
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return cur?.id === fromId ? path.reverse() : []
}

// 親を辿ってルート（parentId がない、または map にない）の id を返す
function rootOrgId(orgId: string, map: Map<string, Organization>): string {
  let cur = map.get(orgId)
  while (cur?.parentId && map.has(cur.parentId)) cur = map.get(cur.parentId)
  return cur?.id ?? orgId
}

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
  expandedChipIds:      Set<string>
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

  // チップ展開
  toggleChip:               (orgId: string) => void
  selectPersonAndFocusOrg:  (personId: string) => void

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
    expandedChipIds:      new Set<string>(),

    // ── アクション ────────────────────────────────────────────────
    loadExcelData: async (result) => {
      const { save } = await import('../store/codeListStore').then(m => ({ save: m.useCodeListStore.getState().save }))
      appService.loadExcelData({
        allocationList:      result.allocationList,
        beforeOrganizations: result.beforeOrganizations,
        afterOrganizations:  result.afterOrganizations,
        codeLists:           result.codeLists,
      })
      await save(result.codeLists)
      set({ isLoading: false, selectedPersonId: null, selectedRowId: null, focusedOrgId: null, expandedChipIds: new Set() })
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
      set({ selectedPersonId: null, selectedRowId: null, focusedOrgId: null, isLoading: false, expandedChipIds: new Set() })
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

    toggleChip: (orgId) => {
      const { expandedChipIds } = get()
      const next = new Set(expandedChipIds)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      set({ expandedChipIds: next })
    },

    selectPersonAndFocusOrg: (personId) => {
      const { afterOrganizations, persons, allocationList, focusedOrgId, expandedChipIds } = get()
      const person = persons.find(p => p.id === personId)
      if (!person) { set({ selectedPersonId: personId, workspaceMode: 'org' }); return }

      const row = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
               ?? allocationList.find(r => r.userId === person.sfPersonId)
      const deptCode = row?.departmentCode
      if (!deptCode) { set({ selectedPersonId: personId, workspaceMode: 'org' }); return }

      const orgById  = buildIdMap(afterOrganizations)
      const orgByExt = new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o]))
      const personOrg = orgByExt.get(deptCode) ?? orgById.get(deptCode)
      if (!personOrg) { set({ selectedPersonId: personId, workspaceMode: 'org' }); return }

      const newExpanded = new Set(expandedChipIds)
      let newFocusedOrgId = focusedOrgId

      if (focusedOrgId && isDescendantOf(personOrg.id, focusedOrgId, orgById)) {
        for (const id of pathBetween(focusedOrgId, personOrg.id, orgById)) newExpanded.add(id)
      } else {
        newFocusedOrgId = rootOrgId(personOrg.id, orgById)
        for (const id of pathBetween(newFocusedOrgId, personOrg.id, orgById)) newExpanded.add(id)
      }

      set({ selectedPersonId: personId, workspaceMode: 'org', focusedOrgId: newFocusedOrgId, expandedChipIds: newExpanded })
    },

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
