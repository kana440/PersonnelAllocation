import { create } from 'zustand/react'

// 'collapsed' を廃止: 'windowed' | 'inline' の2択
export type ChildrenMode = 'windowed' | 'inline'

export interface PanelDef {
  id:           string
  orgId:        string
  x:            number
  y:            number
  /** true = コンテンツを表示、false = タイトルバーのみ（root）またはグレーチップ（子） */
  open:         boolean
  /** 開いている子組織をどう表示するか（このパネル自身の設定） */
  childrenMode: ChildrenMode
}

const WINDOW_W   = 288
const WINDOW_GAP = 24

let _counter = 0
function genId() { return `panel_${++_counter}` }

function defaultPosition(existingPanels: PanelDef[]): { x: number; y: number } {
  const col = existingPanels.length % 5
  const row = Math.floor(existingPanels.length / 5)
  return { x: 40 + col * (WINDOW_W + WINDOW_GAP), y: 40 + row * 420 }
}

function makePanelDef(
  orgId: string,
  pos: { x: number; y: number },
  open = true,
  childrenMode: ChildrenMode = 'windowed',
): PanelDef {
  return { id: genId(), orgId, ...pos, open, childrenMode }
}

interface CanvasLayoutState {
  panels: PanelDef[]

  /** Excel 読み込み時: 全 orgs のパネルを作成。root (parentId なし) は open=true、それ以外は false */
  initPanels:    (orgs: { id: string; parentId?: string | null }[]) => void
  addPanel:      (orgId: string) => void
  removePanel:   (panelId: string) => void
  reorderPanels: (orderedIds: string[]) => void
  isInPanels:    (orgId: string) => boolean
  clearPanels:   () => void

  setOpen:     (panelId: string, open: boolean) => void
  setOrgOpen:  (orgId: string, open: boolean) => void
  toggleOpen:  (panelId: string) => void

  setPosition:  (panelId: string, x: number, y: number) => void
  setPositions: (positions: Map<string, { x: number; y: number }>) => void

  /** 子組織の表示モードを切り替え（windowed / inline） */
  setChildrenMode: (panelId: string, mode: ChildrenMode) => void

  // ── 自動整列 ────────────────────────────────────────────────────
  autoArrange:    boolean
  arrangeVersion: number
  setAutoArrange: (v: boolean) => void
  triggerArrange: () => void

  // ── 比較モード ──────────────────────────────────────────────────
  comparisonMode:               boolean
  comparisonPanels:             PanelDef[]
  comparisonOrgMapping:         Record<string, string>
  pendingMappingBeforeOrgId:    string | null
  toggleComparisonMode:         () => void
  addComparisonPanel:           (beforeOrgId: string) => void
  removeComparisonPanel:        (panelId: string) => void
  reorderComparisonPanels:      (orderedIds: string[]) => void
  isInComparisonPanels:         (beforeOrgId: string) => boolean
  setComparisonOrgMap:          (beforeOrgId: string, afterOrgId: string) => void
  clearComparisonOrgMap:        (beforeOrgId: string) => void
  setPendingMappingBeforeOrgId: (id: string | null) => void
  clearComparisonState:         () => void
  /** 比較モード ON 時に beforeOrgs 全体からパネルを自動初期化 */
  initComparisonPanels:         (orgIds: string[]) => void

  // ── 旧組織キャンバス（comparison panels）の個別操作 ─────────────
  setComparisonPosition:     (panelId: string, x: number, y: number) => void
  setComparisonPositions:    (positions: Map<string, { x: number; y: number }>) => void
  toggleComparisonPanelOpen: (panelId: string) => void
  setComparisonOrgOpen:      (orgId: string, open: boolean) => void
  setComparisonChildrenMode: (panelId: string, mode: ChildrenMode) => void
  comparisonArrangeVersion:  number
  triggerComparisonArrange:  () => void
}

export const useCanvasLayoutStore = create<CanvasLayoutState>()((set, get) => ({
  panels: [],

  initPanels: (orgs) => {
    const panels: PanelDef[] = orgs.map((org, i) =>
      makePanelDef(
        org.id,
        { x: 40 + (i % 5) * (WINDOW_W + WINDOW_GAP), y: 40 + Math.floor(i / 5) * 420 },
        true,
        'windowed',
      )
    )
    set({ panels })
    // 読み込み直後に自動整列を発火（arrangeVersion を必ず 1 以上にする）
    if (get().autoArrange) get().triggerArrange()
    else set(s => ({ arrangeVersion: Math.max(s.arrangeVersion, 1) }))
  },

  addPanel: (orgId) => {
    const existing = get().panels.find(p => p.orgId === orgId)
    if (existing) {
      // すでにパネルがある場合は open にする
      set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open: true } : p) }))
      return
    }
    const pos = defaultPosition(get().panels)
    set(s => ({ panels: [...s.panels, makePanelDef(orgId, pos, true)] }))
  },

  removePanel: (panelId) =>
    set(s => ({ panels: s.panels.filter(p => p.id !== panelId) })),

  reorderPanels: (orderedIds) => {
    set(s => {
      const map     = new Map(s.panels.map(p => [p.id, p]))
      const next    = orderedIds.flatMap(id => { const p = map.get(id); return p ? [p] : [] })
      const inOrder = new Set(orderedIds)
      const rest    = s.panels.filter(p => !inOrder.has(p.id))
      return { panels: [...next, ...rest] }
    })
  },

  isInPanels: (orgId) => get().panels.some(p => p.orgId === orgId),

  clearPanels: () => set({ panels: [], comparisonPanels: [], comparisonOrgMapping: {}, pendingMappingBeforeOrgId: null, comparisonArrangeVersion: 0 }),

  setOpen: (panelId, open) => {
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, open } : p) }))
    if (get().autoArrange) get().triggerArrange()
  },

  setOrgOpen: (orgId, open) => {
    set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open } : p) }))
    if (get().autoArrange) get().triggerArrange()
  },

  // ─ ボタンはウィンドウの最小化操作なので自動整列は発火しない
  toggleOpen: (panelId) =>
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, open: !p.open } : p) })),

  setPosition: (panelId, x, y) =>
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, x, y } : p) })),

  setPositions: (positions) =>
    set(s => ({
      panels: s.panels.map(p => {
        const pos = positions.get(p.id)
        return pos ? { ...p, x: pos.x, y: pos.y } : p
      }),
    })),

  setChildrenMode: (panelId, mode) => {
    set(s => ({
      panels: s.panels.map(p => p.id === panelId ? { ...p, childrenMode: mode } : p),
    }))
    if (get().autoArrange) get().triggerArrange()
  },

  // ── 自動整列 ────────────────────────────────────────────────────
  autoArrange:    true,
  arrangeVersion: 0,
  setAutoArrange: (v) => set({ autoArrange: v }),
  triggerArrange: ()  => set(s => ({ arrangeVersion: s.arrangeVersion + 1 })),

  // ── 比較モード ──────────────────────────────────────────────────
  comparisonMode:            false,
  comparisonPanels:          [],
  comparisonOrgMapping:      {},
  pendingMappingBeforeOrgId: null,

  toggleComparisonMode: () => set(s => ({ comparisonMode: !s.comparisonMode })),

  addComparisonPanel: (beforeOrgId) => {
    if (get().comparisonPanels.some(p => p.orgId === beforeOrgId)) return
    const pos = defaultPosition(get().comparisonPanels)
    set(s => ({ comparisonPanels: [...s.comparisonPanels, makePanelDef(beforeOrgId, pos)] }))
  },

  removeComparisonPanel: (panelId) =>
    set(s => ({ comparisonPanels: s.comparisonPanels.filter(p => p.id !== panelId) })),

  reorderComparisonPanels: (orderedIds) => {
    set(s => {
      const map     = new Map(s.comparisonPanels.map(p => [p.id, p]))
      const next    = orderedIds.flatMap(id => { const p = map.get(id); return p ? [p] : [] })
      const inOrder = new Set(orderedIds)
      const rest    = s.comparisonPanels.filter(p => !inOrder.has(p.id))
      return { comparisonPanels: [...next, ...rest] }
    })
  },

  isInComparisonPanels: (beforeOrgId) => get().comparisonPanels.some(p => p.orgId === beforeOrgId),

  setComparisonOrgMap: (beforeOrgId, afterOrgId) =>
    set(s => ({ comparisonOrgMapping: { ...s.comparisonOrgMapping, [beforeOrgId]: afterOrgId } })),

  clearComparisonOrgMap: (beforeOrgId) =>
    set(s => {
      const next = { ...s.comparisonOrgMapping }
      delete next[beforeOrgId]
      return { comparisonOrgMapping: next }
    }),

  setPendingMappingBeforeOrgId: (id) => set({ pendingMappingBeforeOrgId: id }),

  clearComparisonState: () =>
    set({ comparisonMode: false, comparisonPanels: [], comparisonOrgMapping: {}, pendingMappingBeforeOrgId: null, comparisonArrangeVersion: 0 }),

  initComparisonPanels: (orgIds) => {
    if (get().comparisonPanels.length > 0) return
    const panels: PanelDef[] = orgIds.map((orgId, i) =>
      makePanelDef(
        orgId,
        { x: 40 + (i % 5) * (WINDOW_W + WINDOW_GAP), y: 40 + Math.floor(i / 5) * 420 },
        true,
        'windowed',
      )
    )
    set({ comparisonPanels: panels })
    get().triggerComparisonArrange()
  },

  // ── 旧組織キャンバス（comparison panels）の個別操作 ─────────────
  setComparisonPosition: (panelId, x, y) =>
    set(s => ({ comparisonPanels: s.comparisonPanels.map(p => p.id === panelId ? { ...p, x, y } : p) })),

  setComparisonPositions: (positions) =>
    set(s => ({
      comparisonPanels: s.comparisonPanels.map(p => {
        const pos = positions.get(p.id)
        return pos ? { ...p, x: pos.x, y: pos.y } : p
      }),
    })),

  toggleComparisonPanelOpen: (panelId) =>
    set(s => ({ comparisonPanels: s.comparisonPanels.map(p => p.id === panelId ? { ...p, open: !p.open } : p) })),

  setComparisonOrgOpen: (orgId, open) => {
    set(s => ({ comparisonPanels: s.comparisonPanels.map(p => p.orgId === orgId ? { ...p, open } : p) }))
    if (get().comparisonArrangeVersion > 0) get().triggerComparisonArrange()
  },

  setComparisonChildrenMode: (panelId, mode) => {
    set(s => ({ comparisonPanels: s.comparisonPanels.map(p => p.id === panelId ? { ...p, childrenMode: mode } : p) }))
    if (get().comparisonArrangeVersion > 0) get().triggerComparisonArrange()
  },

  comparisonArrangeVersion: 0,
  triggerComparisonArrange: () => set(s => ({ comparisonArrangeVersion: s.comparisonArrangeVersion + 1 })),
}))
