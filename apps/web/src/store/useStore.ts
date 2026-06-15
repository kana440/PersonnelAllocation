import { create } from 'zustand/react'
import type { AfterValues } from '@personnel/domain/allocationRow'
import type { ValidationResult } from '@personnel/domain/commands/types'
import { appService } from '../application/HRApplicationService'
import type { DomainSnapshot } from '../application/HRApplicationService'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { getDescendantOrgIds } from '@personnel/domain/choices/orgTree'
import type { ImportMode, AssigneeImportMode, MergeResult } from '../application/importMerge'
import type { PositionCodeAssignment, UnassignedPosition } from '../ports'
import { DEFAULT_SESSION } from '../application/userSession'
import type { UserSession } from '../application/userSession'

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
  scopeOrgId:           string | null    // 主after-org（org chart フォーカス用、setScopeWithMappingが計算）
  beforeScopeOrgId:     string | null    // スコープ選択の旧組織ID
  afterScopeOrgIds:     string[]         // beforeScopeOrgId + orgMapping から導出したafter-org ID一覧
  orgMapping:           Map<string, string[]>  // 旧組織ID → 新組織IDリスト
  userSession:          UserSession             // 現在のユーザーセッション（ロール + 担当者名）
  adminAssigneeFilter:  string | null          // 管理者モードでの担当者プレビューフィルタ（UI表示用）
}

// ── アクション ────────────────────────────────────────────────────
interface Actions {
  // データロード
  loadExcelData: (result: import('../infrastructure/excel/types').ImportedWorkbookResult) => Promise<void>

  // 行の直接編集
  editRow:   (rowId: number, changes: AfterValues) => void
  saveRow:   (rowId: number, changes: AfterValues) => ValidationResult
  selectRow: (rowId: number | null) => void

  // 追加インポート（マージ）
  mergeExcelData: (data: { allocationList: AllocationRow[]; mode: ImportMode; assigneeMode: AssigneeImportMode }) => MergeResult

  // ポジション操作
  createVacantPosition:         (departmentCode: string, localJobTitle: string) => void
  removePosition:               (rowId: number) => void
  assignPersonToVacantPosition: (vacantRowId: number, personSfId: string) => void
  unassignPersonFromPosition:   (occupiedRowId: number) => void

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
  revertToHistoryIndex: (index: number, direction: 'past' | 'future') => void

  // 一括再導出
  reDeriveManagerNames: () => number
  reDeriveOrgSubFields: () => number

  // ポジションコード割当
  getUnassignedPositions: () => UnassignedPosition[]
  assignPositionCodes: (assignments: PositionCodeAssignment[]) => ValidationResult

  // 履歴プレビュー
  previewHistoryAt:    (position: number) => void
  cancelHistoryPreview: () => void
  applyHistoryPreview:  () => void

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

  // 編集モード（直接編集）
  enterEditMode:      (rowId: number) => void
  exitEditMode:       () => void

  // 操作パネルモード（FloatingEditor 内で操作を選んで実行するフロー）
  operationPanelRowId: number | null
  enterOperationPanel: (rowId: number) => void
  exitOperationPanel:  () => void
  setMainCanvasMode:  (mode: '組織図' | 'レポートライン') => void

  // チップ展開
  toggleChip:               (orgId: string) => void
  selectPersonAndFocusOrg:  (personId: string) => void

  // 作業スコープ（後方互換：MergeImportButton 等が直接 after-org ID で呼ぶ）
  setScopeOrgId: (id: string | null) => void

  // スコープ + org マッピングを一括設定（SetupView / ScopeMappingDialog が使う）
  setScopeWithMapping: (params: {
    beforeOrgId:    string | null
    mapping:        Map<string, string[]>
  }) => void

  // 組織マッピング（旧組織ID → 新組織IDリスト）
  setOrgMapping: (mapping: Map<string, string[]>) => void

  // ユーザーセッション
  setUserSession: (session: UserSession) => void
  setAdminAssigneeFilter: (name: string | null) => void

  // 後方互換（既存コンポーネントが参照している場合のみ残す）
  setRawImportedRows: (rows: AllocationRow[]) => void
}

type AppState = DomainSnapshot & UIState & Actions

export const useStore = create<AppState>()((set, get) => {
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
    operationPanelRowId:  null,
    mainCanvasMode:       '組織図',
    expandedChipIds:      new Set<string>(),
    scopeOrgId:           null,
    beforeScopeOrgId:     null,
    afterScopeOrgIds:     [],
    orgMapping:           new Map<string, string[]>(),
    userSession:          DEFAULT_SESSION,
    adminAssigneeFilter:  null,

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
      // 新しいデータが読み込まれたらパネルをリセットして関連組織を自動追加
      const { clearPanels, initPanels } = await import('../store/canvasLayoutStore').then(m => ({
        clearPanels: m.useCanvasLayoutStore.getState().clearPanels,
        initPanels:  m.useCanvasLayoutStore.getState().initPanels,
      }))
      clearPanels()
      initPanels(result.afterOrganizations)
    },

    mergeExcelData: (data) => appService.mergeExcelData(data),

    createVacantPosition:         (deptCode, title)          => {
      const { userSession } = get()
      const assignee = userSession.assigneeName ?? undefined
      appService.createVacantPosition(deptCode, title, assignee ? { assignee } : undefined)
    },
    removePosition:               (rowId)                    => appService.removePosition(rowId),
    assignPersonToVacantPosition: (vacantRowId, personSfId)  => appService.assignPersonToVacantPosition(vacantRowId, personSfId),
    unassignPersonFromPosition:   (rowId)                    => appService.unassignPersonFromPosition(rowId),

    editRow:   (rowId, changes) => appService.editRow(rowId, changes),
    saveRow:   (rowId, changes) => appService.saveRow(rowId, changes),

    selectRow: (rowId) => set({ selectedRowId: rowId }),

    addNewHire: ({ name, employeeNumber, orgId, companyId }) => {
      const { effectiveDate, userSession } = get()
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
        assignee:       userSession.assigneeName ?? undefined,
      })
    },

    undo: () => appService.undo(),
    redo: () => appService.redo(),
    revertToHistoryIndex: (index, direction) => appService.revertToHistoryIndex(index, direction),
    reDeriveManagerNames: () => appService.reDeriveManagerNames(),
    reDeriveOrgSubFields: () => appService.reDeriveOrgSubFields(),
    getUnassignedPositions: () => appService.getUnassignedPositions(),
    assignPositionCodes:    (assignments) => appService.assignPositionCodes(assignments),
    previewHistoryAt:    (position) => appService.previewHistoryAt(position),
    cancelHistoryPreview: () => appService.cancelHistoryPreview(),
    applyHistoryPreview:  () => appService.applyHistoryPreview(),

    reset: () => {
      appService.reset()
      set({ selectedPersonId: null, selectedRowId: null, focusedOrgId: null, isLoading: false, expandedChipIds: new Set() })
      import('../store/canvasLayoutStore').then(m => m.useCanvasLayoutStore.getState().clearPanels())
    },

    enterEditMode: (rowId) => {
      const { focusedOrgId, selectedPersonId, mainCanvasMode, allocationList, persons } = get()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row) return
      const person = persons.find(p => p.sfPersonId === row.userId)
      set({
        editMode:            true,
        operationPanelRowId: null,   // 操作パネルと排他
        previousViewState:   { viewLabel: mainCanvasMode, focusedOrgId, selectedPersonId },
        selectedRowId:       rowId,
        selectedPersonId:    person?.id ?? selectedPersonId,
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

    enterOperationPanel: (rowId) => {
      const { allocationList, persons, focusedOrgId, selectedPersonId, mainCanvasMode } = get()
      const row    = allocationList.find(r => r.rowId === rowId)
      if (!row) return
      const person = persons.find(p => p.sfPersonId === row.userId)
      set({
        operationPanelRowId: rowId,
        editMode:            false,   // 直接編集と排他
        previousViewState:   { viewLabel: mainCanvasMode, focusedOrgId, selectedPersonId },
        selectedRowId:       rowId,
        selectedPersonId:    person?.id ?? selectedPersonId,
      })
    },

    exitOperationPanel: () => {
      const { previousViewState } = get()
      set({
        operationPanelRowId: null,
        selectedRowId:       null,
        focusedOrgId:        previousViewState?.focusedOrgId ?? null,
        selectedPersonId:    previousViewState?.selectedPersonId ?? null,
        previousViewState:   null,
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

    setScopeOrgId: (id) => {
      const { focusedOrgId, afterOrganizations } = get()
      let newFocusedOrgId = focusedOrgId
      if (id) {
        const scopeIds = getDescendantOrgIds(id, afterOrganizations)
        if (!focusedOrgId || !scopeIds.has(focusedOrgId)) {
          newFocusedOrgId = id
        }
      }
      set({ scopeOrgId: id, focusedOrgId: newFocusedOrgId })
    },

    setScopeWithMapping: ({ beforeOrgId, mapping }) => {
      const { beforeOrganizations, afterOrganizations, focusedOrgId } = get()

      let afterScopeOrgIds: string[] = []
      let primaryAfterOrgId: string | null = null

      if (beforeOrgId) {
        const beforeScopeIds = getDescendantOrgIds(beforeOrgId, beforeOrganizations)
        const afterIdSet = new Set<string>()

        for (const bId of beforeScopeIds) {
          let afterIds = mapping.get(bId) ?? []
          // マッピング未設定の場合は externalCode で fallback
          if (afterIds.length === 0 && !mapping.has(bId)) {
            const bOrg = beforeOrganizations.find(o => o.id === bId)
            const aOrg = bOrg?.externalCode
              ? afterOrganizations.find(o => o.externalCode === bOrg.externalCode)
              : undefined
            if (aOrg) afterIds = [aOrg.id]
          }
          for (const aId of afterIds) {
            getDescendantOrgIds(aId, afterOrganizations).forEach(id => afterIdSet.add(id))
          }
        }
        afterScopeOrgIds = Array.from(afterIdSet)

        // org chart フォーカス用: ルートの before-org に対応する最初の after-org
        const rootAfterIds = mapping.get(beforeOrgId) ?? []
        primaryAfterOrgId = rootAfterIds[0] ?? null
        if (!primaryAfterOrgId) {
          const bOrg = beforeOrganizations.find(o => o.id === beforeOrgId)
          primaryAfterOrgId = bOrg?.externalCode
            ? (afterOrganizations.find(o => o.externalCode === bOrg!.externalCode)?.id ?? null)
            : null
        }
      }

      const afterScopeIdSet = new Set(afterScopeOrgIds)
      let newFocusedOrgId = focusedOrgId
      if (primaryAfterOrgId && (!focusedOrgId || !afterScopeIdSet.has(focusedOrgId))) {
        newFocusedOrgId = primaryAfterOrgId
      }

      set({
        beforeScopeOrgId: beforeOrgId,
        afterScopeOrgIds,
        scopeOrgId:       primaryAfterOrgId,
        orgMapping:       mapping,
        focusedOrgId:     newFocusedOrgId,
      })
    },

    setOrgMapping: (mapping) => set({ orgMapping: mapping }),

    setUserSession: (session) => set({ userSession: session }),
    setAdminAssigneeFilter: (name) => set({ adminAssigneeFilter: name }),

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
