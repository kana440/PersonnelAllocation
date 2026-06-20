import { create } from 'zustand/react'

// 'collapsed' を廃止: 'windowed' | 'inline' の2択
export type ChildrenMode = 'windowed' | 'inline'

export interface PanelDef {
  id:              string
  orgId:           string
  x:               number
  y:               number
  /** true = コンテンツを表示、false = タイトルバーのみ（root）またはグレーチップ（子） */
  open:            boolean
  /** 開いている子組織をどう表示するか（このパネル自身の設定） */
  childrenMode:    ChildrenMode
  /** リストモードで明示的に折りたたまれた組織 ID。空 = 全展開（デフォルト） */
  collapsedOrgIds: string[]
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
  collapsedOrgIds: string[] = [],
): PanelDef {
  return { id: genId(), orgId, ...pos, open, childrenMode, collapsedOrgIds }
}

interface CanvasLayoutState {
  panels: PanelDef[]

  // ── 接続線スタイル ──────────────────────────────────────────────
  lineStyle:    'bezier' | 'polyline'
  setLineStyle: (style: 'bezier' | 'polyline') => void

  // ── パネル実測高さ（ResizeObserver から更新）────────────────────
  /** panelId → px。未計測は undefined（計算時は EST_WIN_H でフォールバック） */
  panelHeights:   Record<string, number>
  setPanelHeight: (panelId: string, height: number) => void

  // ── 組織選択（キャンバスフォーカス）──────────────────────────────
  /** 選択中の組織 ID（ハイライト用）。人物選択と排他 */
  selectedOrgId:     string | null
  /** 組織を選択しキャンバス中央にスクロール要求を発行する */
  selectOrg:         (orgId: string) => void
  clearOrgSelection: () => void
  /** 非null のとき TreeWindowCanvas が対応パネルを中央にスクロールし null に戻す */
  scrollToOrgId:       string | null
  requestScrollToOrg:  (orgId: string | null) => void

  /** Excel 読み込み時: ルート組織のみパネルを作成 */
  initPanels:         (orgs: { id: string; parentId?: string | null }[], memberOrgIds?: Set<string>) => void
  addPanel:           (orgId: string, options?: { childrenMode?: ChildrenMode; collapsedOrgIds?: string[] }) => void
  setCollapsedOrgIds: (panelId: string, ids: string[]) => void
  removePanel:        (panelId: string) => void
  reorderPanels:      (orderedIds: string[]) => void
  isInPanels:         (orgId: string) => boolean
  clearPanels:        () => void

  setOpen:     (panelId: string, open: boolean) => void
  setOrgOpen:  (orgId: string, open: boolean) => void
  toggleOpen:  (panelId: string) => void

  setPosition:  (panelId: string, x: number, y: number) => void
  setPositions: (positions: Map<string, { x: number; y: number }>) => void

  /** 子組織の表示モードを切り替え（windowed / inline） */
  setChildrenMode: (panelId: string, mode: ChildrenMode) => void

  // ── 自動整列 ────────────────────────────────────────────────────
  // positions は autoArrange=ON のとき TreeWindowCanvas の useMemo で直接導出される。
  // autoArrange=OFF のとき panel.x/y（手動配置済み座標）を使用。
  autoArrange:    boolean
  setAutoArrange: (v: boolean) => void

  // ── キャンバスパン要求 ──────────────────────────────────────────
  /** 非null のとき TreeWindowCanvas が data-personid 要素を中央にスクロールし null に戻す */
  scrollToPersonId:      string | null
  requestScrollToPerson: (personId: string | null) => void

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

  // ── 接続線スタイル ──────────────────────────────────────────────
  lineStyle:    'polyline',
  setLineStyle: (style) => set({ lineStyle: style }),

  // ── パネル実測高さ ──────────────────────────────────────────────
  panelHeights: {},
  setPanelHeight: (panelId, height) => {
    set(s => {
      if (s.panelHeights[panelId] === height) return s
      return { panelHeights: { ...s.panelHeights, [panelId]: height } }
    })
  },

  // ── 組織選択 ────────────────────────────────────────────────────
  selectedOrgId: null,
  selectOrg: (orgId) => set({ selectedOrgId: orgId, scrollToOrgId: orgId }),
  clearOrgSelection: () => set({ selectedOrgId: null }),
  scrollToOrgId: null,
  requestScrollToOrg: (orgId) => set({ scrollToOrgId: orgId }),

  initPanels: (orgs, _memberOrgIds?) => {
    const orgIds   = new Set(orgs.map(o => o.id))
    const rootOrgs = orgs.filter(o => !o.parentId || !orgIds.has(o.parentId))
    const panels: PanelDef[] = rootOrgs.map((org, i) =>
      makePanelDef(
        org.id,
        { x: 40 + (i % 5) * (WINDOW_W + WINDOW_GAP), y: 40 + Math.floor(i / 5) * 420 },
        true,
        'windowed',
      )
    )
    set({ panels })
  },

  addPanel: (orgId, options?) => {
    const existing = get().panels.find(p => p.orgId === orgId)
    if (existing) {
      set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open: true } : p) }))
      return
    }
    const pos = defaultPosition(get().panels)
    set(s => ({ panels: [...s.panels, makePanelDef(orgId, pos, true, options?.childrenMode, options?.collapsedOrgIds)] }))
  },

  setCollapsedOrgIds: (panelId, ids) => {
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, collapsedOrgIds: ids } : p) }))
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

  clearPanels: () => set({
    panels: [], panelHeights: {}, selectedOrgId: null, scrollToOrgId: null,
    comparisonPanels: [], comparisonOrgMapping: {},
    pendingMappingBeforeOrgId: null, comparisonArrangeVersion: 0,
  }),

  setOpen:    (panelId, open) =>
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, open } : p) })),

  setOrgOpen: (orgId, open) =>
    set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open } : p) })),

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

  setChildrenMode: (panelId, mode) =>
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, childrenMode: mode } : p) })),

  // ── 自動整列 ────────────────────────────────────────────────────
  autoArrange:    true,
  setAutoArrange: (v) => set({ autoArrange: v }),

  // ── キャンバスパン要求 ──────────────────────────────────────────
  scrollToPersonId: null,
  requestScrollToPerson: (personId) => set({ scrollToPersonId: personId }),

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
