import { create } from 'zustand/react'
import {
  makeFilterCard, DEFAULT_GLOBAL_FILTERS,
  type FilterCard, type GlobalFilters,
} from '../components/canvas/FilterBar/types'
import type { Organization } from '@personnel/domain/schemas'

// 'collapsed' を廃止: 'windowed' | 'inline' の2択
export type ChildrenMode = 'windowed' | 'inline'

/** キャンバスパネルのレンダリングスタイル: 'tree' = ツリー形式, 'band' = バンド形式 */
export type CanvasPanelStyle = 'tree' | 'band'

/** スタイルごとのパネル幅（レイアウト計算と DOM 幅の両方に使用） */
export const VIEW_MODE_WIDTHS: Record<CanvasPanelStyle, number> = {
  tree: 288,
  band: 208,
}

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

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.0

interface CanvasLayoutState {
  panels: PanelDef[]

  // ── ズーム（通常・比較モード共通） ───────────────────────────────
  canvasZoom:     number
  setCanvasZoom:  (v: number) => void
  stepCanvasZoom: (delta: number) => void

  // ── 接続線スタイル ──────────────────────────────────────────────
  lineStyle:    'bezier' | 'polyline'
  setLineStyle: (style: 'bezier' | 'polyline') => void

  // ── パネル実測高さ（ResizeObserver から更新）────────────────────
  /** panelId → px。未計測は undefined（計算時は EST_WIN_H でフォールバック） */
  panelHeights:   Record<string, number>
  setPanelHeight: (panelId: string, height: number) => void

  // ── キャンバススクロール要求（組織パネル）──────────────────────
  /** 非null のとき TreeWindowCanvas が対応パネルを中央にスクロールし null に戻す */
  scrollToOrgId:      string | null
  requestScrollToOrg: (orgId: string | null) => void

  addPanel:       (orgId: string, options?: { childrenMode?: ChildrenMode; collapsedOrgIds?: string[] }) => void
  /** 複数 org を一括でパネル追加（1回の set() でまとめる）。既存パネルはスキップ */
  addPanelsBatch: (orgIds: string[]) => void
  /** 全組織を一括でパネルとして設定し、メンバー組織の LCA フィルタも同時確定する（Excel ロード時） */
  initPanelsForOrgs: (orgIds: string[], memberOrgIds?: string[], orgById?: Map<string, Organization>) => void
  setCollapsedOrgIds: (panelId: string, ids: string[]) => void
  removePanel:        (panelId: string) => void
  removeOrgPanels:    (orgIds: readonly string[]) => void
  reorderPanels:      (orderedIds: string[]) => void
  isInPanels:         (orgId: string) => boolean
  clearPanels:        () => void

  setOpen:     (panelId: string, open: boolean) => void
  setOrgOpen:  (orgId: string, open: boolean) => void
  toggleOpen:  (panelId: string) => void

  /**
   * orgId から根組織まで遡り、閉じている祖先パネルを全て開く（対象自身も含む）。
   * 初期表示はルート組織のみ open のため、ナビ・検索・レビュー画面からの選択でも
   * 対象が見えるようにするための共通ヘルパー。兄弟・親の兄弟には触れない。
   */
  openOrgAncestors: (orgId: string, orgById: Map<string, Organization>) => void

  /**
   * 現在ドラッグ中のパネル ID。仮想化（画面外パネルの非描画）で、
   * ドラッグ中のパネルだけは可視範囲外でも常に描画対象に含めるためのガード。
   * PanelDef に持たせず独立フィールドにするのは、これが UI 一時状態であり
   * clearPanels() 等の panels 配列操作に巻き込まれるべきではないため。
   */
  draggingPanelId:    string | null
  setDraggingPanelId: (panelId: string | null) => void

  setPosition:  (panelId: string, x: number, y: number) => void
  setPositions: (positions: Map<string, { x: number; y: number }>) => void

  /** 子組織の表示モードを切り替え（windowed / inline） */
  setChildrenMode: (panelId: string, mode: ChildrenMode) => void

  // ── 空席ポジション表示 ───────────────────────────────────────────
  /** true のとき positionCode ありで userId なしのポジション行を表示する */
  showVacantPositions:       boolean
  toggleShowVacantPositions: () => void

  // ── キャンバスパネルスタイル ─────────────────────────────────────
  /** 'tree' = レポートラインツリー（デフォルト）, 'band' = バンド別コンパクト表示 */
  canvasPanelStyle:    CanvasPanelStyle
  setCanvasPanelStyle: (style: CanvasPanelStyle) => void

  // ── 自動整列 ────────────────────────────────────────────────────
  // positions は autoArrange=ON のとき TreeWindowCanvas の useMemo で直接導出される。
  // autoArrange=OFF のとき panel.x/y（手動配置済み座標）を使用。
  autoArrange:    boolean
  setAutoArrange: (v: boolean) => void

  // ── キャンバスパン要求（行）──────────────────────────────────────
  /**
   * 非null のとき TreeWindowCanvas が data-rowid 要素を中央にスクロールする。
   * seq は同一 rowId の連続リクエストを区別するためのカウンタ。
   */
  scrollToRowRequest: { rowId: number; seq: number } | null
  requestScrollToRow: (rowId: number | null) => void

  /** 非null のとき BeforeTreeWindowCanvas が対応カードを中央にスクロールする（サイドバー起動用）*/
  scrollToBeforeRowRequest: { rowId: number; seq: number } | null
  requestScrollToBeforeRow: (rowId: number | null) => void

  /** キャンバス外側スクロールコンテナの保存位置（表示切替後の即時復元に使用） */
  canvasScrollPos:     { left: number; top: number }
  saveCanvasScrollPos: (left: number, top: number) => void

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
  /** 比較モード ON 時に beforeOrgs 全体からパネルを自動初期化（ルートのみ open:true） */
  initComparisonPanels:         (orgIds: string[], rootOrgIds?: Set<string>) => void

  // ── 旧組織キャンバス（comparison panels）の個別操作 ─────────────
  setComparisonPosition:        (panelId: string, x: number, y: number) => void
  setComparisonPositions:       (positions: Map<string, { x: number; y: number }>) => void
  toggleComparisonPanelOpen:    (panelId: string) => void
  setComparisonOrgOpen:         (orgId: string, open: boolean) => void
  setComparisonChildrenMode:    (panelId: string, mode: ChildrenMode) => void
  setComparisonCollapsedOrgIds: (panelId: string, ids: string[]) => void
  comparisonArrangeVersion:     number
  triggerComparisonArrange:     () => void

  // ── キャンバスフィルタ ────────────────────────────────────────────
  filterCards:        FilterCard[]
  globalFilters:      GlobalFilters
  addFilterCard:      (card?: FilterCard) => void
  updateFilterCard:   (id: string, card: FilterCard) => void
  removeFilterCard:   (id: string) => void
  updateGlobalFilters:(update: Partial<GlobalFilters>) => void
  resetFilters:       () => void
}

export const useCanvasLayoutStore = create<CanvasLayoutState>()((set, get) => ({
  panels: [],

  // ── ズーム ──────────────────────────────────────────────────────
  canvasZoom: 1,
  setCanvasZoom: (v) => set({ canvasZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v)) }),
  stepCanvasZoom: (delta) => set(s => ({
    canvasZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
      Math.round((s.canvasZoom + delta) * 100) / 100,
    )),
  })),

  // ── 接続線スタイル ──────────────────────────────────────────────
  lineStyle:    'polyline',
  setLineStyle: (style) => set({ lineStyle: style }),

  // ── パネル実測高さ ──────────────────────────────────────────────
  panelHeights: {},
  setPanelHeight: (() => {
    // ResizeObserver は同フレーム内で多数発火するため、rAF でバッチ更新して
    // computeLayout の再実行回数を最小化する
    const pending = new Map<string, number>()
    let scheduled = false
    return (panelId: string, height: number) => {
      pending.set(panelId, height)
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        if (pending.size === 0) return
        set(s => {
          let changed = false
          let next = s.panelHeights
          for (const [id, h] of pending) {
            if (next[id] !== h) { if (!changed) { next = { ...next }; changed = true }; next[id] = h }
          }
          pending.clear()
          return changed ? { panelHeights: next } : s
        })
      })
    }
  })(),

  // ── キャンバススクロール要求（組織パネル）──────────────────────
  scrollToOrgId: null,
  requestScrollToOrg: (orgId) => set({ scrollToOrgId: orgId }),

  addPanel: (orgId, options?) => {
    const existing = get().panels.find(p => p.orgId === orgId)
    if (existing) {
      set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open: true } : p) }))
      return
    }
    const pos = defaultPosition(get().panels)
    set(s => ({ panels: [...s.panels, makePanelDef(orgId, pos, true, options?.childrenMode, options?.collapsedOrgIds)] }))
  },

  addPanelsBatch: (orgIds) => {
    set(s => {
      const existingOrgIds = new Set(s.panels.map(p => p.orgId))
      const toAdd = orgIds.filter(id => !existingOrgIds.has(id))
      if (toAdd.length === 0) return s
      const accumulated = [...s.panels]
      const newPanels = toAdd.map(id => {
        const pos = defaultPosition(accumulated)
        const p = makePanelDef(id, pos)
        accumulated.push(p)
        return p
      })
      return { panels: [...s.panels, ...newPanels] }
    })
  },

  initPanelsForOrgs: (orgIds, memberOrgIds?, orgById?) => {
    const memberOrgIdSet = new Set(memberOrgIds ?? [])
    const orgIdSet       = new Set(orgIds)

    // 子 → 親方向のリンクから children Map を構築（サブツリー判定用）
    const childrenById = new Map<string, string[]>()
    if (orgById) {
      for (const orgId of orgIds) {
        const parentId = orgById.get(orgId)?.parentId
        if (parentId && orgIdSet.has(parentId)) {
          const arr = childrenById.get(parentId)
          if (arr) arr.push(orgId)
          else childrenById.set(parentId, [orgId])
        }
      }
    }

    // チップボタンの人数表示と同じロジック: 配下（サブツリー）にメンバーがいれば true
    const subtreeMemo = new Map<string, boolean>()
    const hasSubtreeMembers = (orgId: string): boolean => {
      const cached = subtreeMemo.get(orgId)
      if (cached !== undefined) return cached
      const result = memberOrgIdSet.has(orgId) ||
        (childrenById.get(orgId) ?? []).some(c => hasSubtreeMembers(c))
      subtreeMemo.set(orgId, result)
      return result
    }

    const panels: PanelDef[] = orgIds.map((orgId, i) => {
      const org    = orgById?.get(orgId)
      const isRoot = !org?.parentId || !orgIdSet.has(org.parentId)
      // ルートは常に open。それ以外はボタン人数（配下メンバー数）> 0 なら open、0 なら closed
      return makePanelDef(
        orgId,
        { x: 40 + (i % 5) * (WINDOW_W + WINDOW_GAP), y: 40 + Math.floor(i / 5) * 420 },
        isRoot || hasSubtreeMembers(orgId),
      )
    })
    set({ panels, filterCards: [], globalFilters: DEFAULT_GLOBAL_FILTERS })
  },

  setCollapsedOrgIds: (panelId, ids) => {
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, collapsedOrgIds: ids } : p) }))
  },

  removePanel: (panelId) =>
    set(s => ({ panels: s.panels.filter(p => p.id !== panelId) })),

  removeOrgPanels: (orgIds) => {
    const ids = new Set(orgIds)
    set(s => ({ panels: s.panels.filter(p => !ids.has(p.orgId)) }))
  },

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
    panels: [], panelHeights: {}, scrollToOrgId: null,
    comparisonPanels: [], comparisonOrgMapping: {},
    pendingMappingBeforeOrgId: null, comparisonArrangeVersion: 0,
    filterCards: [], globalFilters: DEFAULT_GLOBAL_FILTERS,
  }),

  setOpen:    (panelId, open) =>
    set(s => ({ panels: s.panels.map(p => p.id === panelId ? { ...p, open } : p) })),

  setOrgOpen: (orgId, open) =>
    set(s => ({ panels: s.panels.map(p => p.orgId === orgId ? { ...p, open } : p) })),

  openOrgAncestors: (orgId, orgById) => {
    const toOpen = new Set<string>()
    let cur = orgById.get(orgId)
    while (cur) {
      toOpen.add(cur.id)
      cur = cur.parentId ? orgById.get(cur.parentId) : undefined
    }
    if (toOpen.size === 0) return
    set(s => ({
      panels: s.panels.map(p => (toOpen.has(p.orgId) && !p.open) ? { ...p, open: true } : p),
    }))
  },

  draggingPanelId:    null,
  setDraggingPanelId: (panelId) => set({ draggingPanelId: panelId }),

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

  // ── 空席ポジション表示 ───────────────────────────────────────────
  showVacantPositions:       false,
  toggleShowVacantPositions: () => set(s => ({ showVacantPositions: !s.showVacantPositions })),

  canvasPanelStyle:    'tree',
  setCanvasPanelStyle: (style) => set({ canvasPanelStyle: style }),

  // ── 自動整列 ────────────────────────────────────────────────────
  autoArrange:    true,
  setAutoArrange: (v) => set({ autoArrange: v }),

  // ── キャンバスパン要求（行）──────────────────────────────────────
  scrollToRowRequest: null,
  requestScrollToRow: (rowId) => {
    if (rowId === null) { set({ scrollToRowRequest: null }); return }
    const seq = (get().scrollToRowRequest?.seq ?? -1) + 1
    set({ scrollToRowRequest: { rowId, seq } })
  },

  canvasScrollPos:     { left: 0, top: 0 },
  saveCanvasScrollPos: (left, top) => set({ canvasScrollPos: { left, top } }),

  scrollToBeforeRowRequest: null,
  requestScrollToBeforeRow: (rowId) => {
    if (rowId === null) { set({ scrollToBeforeRowRequest: null }); return }
    const seq = (get().scrollToBeforeRowRequest?.seq ?? -1) + 1
    set({ scrollToBeforeRowRequest: { rowId, seq } })
  },

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

  initComparisonPanels: (orgIds, rootOrgIds) => {
    const panels: PanelDef[] = orgIds.map((orgId, i) =>
      makePanelDef(
        orgId,
        { x: 40 + (i % 5) * (WINDOW_W + WINDOW_GAP), y: 40 + Math.floor(i / 5) * 420 },
        rootOrgIds ? rootOrgIds.has(orgId) : true,
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

  setComparisonCollapsedOrgIds: (panelId, ids) =>
    set(s => ({ comparisonPanels: s.comparisonPanels.map(p => p.id === panelId ? { ...p, collapsedOrgIds: ids } : p) })),

  comparisonArrangeVersion: 0,
  triggerComparisonArrange: () => set(s => ({ comparisonArrangeVersion: s.comparisonArrangeVersion + 1 })),

  // ── キャンバスフィルタ ────────────────────────────────────────────
  filterCards:    [],
  globalFilters:  DEFAULT_GLOBAL_FILTERS,
  addFilterCard:  (card?) => set(s => ({ filterCards: [...s.filterCards, card ?? makeFilterCard()] })),
  updateFilterCard: (id, card) =>
    set(s => ({ filterCards: s.filterCards.map(c => c.id === id ? card : c) })),
  removeFilterCard: (id) =>
    set(s => ({ filterCards: s.filterCards.filter(c => c.id !== id) })),
  updateGlobalFilters: (update) =>
    set(s => ({ globalFilters: { ...s.globalFilters, ...update } })),
  resetFilters: () => set({ filterCards: [], globalFilters: DEFAULT_GLOBAL_FILTERS }),
}))
