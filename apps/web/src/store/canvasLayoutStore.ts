import { create } from 'zustand/react'

export interface PanelDef {
  id:    string
  orgId: string
}

let _counter = 0
function genId() { return `panel_${++_counter}` }

interface CanvasLayoutState {
  /** 表示中パネルの順序付きリスト。どれが「アクティブ」かは focusedOrgId と照合して導出する */
  panels:        PanelDef[]
  addPanel:      (orgId: string) => void
  removePanel:   (panelId: string) => void
  /** panel.id の配列を渡して並び順を更新する */
  reorderPanels: (orderedIds: string[]) => void
  isInPanels:    (orgId: string) => boolean
  /** Excel ロード時などにパネルをすべてクリアする */
  clearPanels:   () => void

  // ── 比較モード ──────────────────────────────────────────────────
  comparisonMode:               boolean
  /** 比較モード用パネル（orgId = before-org の内部 ID） */
  comparisonPanels:             PanelDef[]
  /** beforeOrgId → afterOrgId の手動マッピング */
  comparisonOrgMapping:         Record<string, string>
  /** ユーザーが「対応する新組織を選択」をクリック中の before-org ID */
  pendingMappingBeforeOrgId:    string | null
  toggleComparisonMode:         () => void
  addComparisonPanel:           (beforeOrgId: string) => void
  removeComparisonPanel:        (panelId: string) => void
  reorderComparisonPanels:      (orderedIds: string[]) => void
  isInComparisonPanels:         (beforeOrgId: string) => boolean
  setComparisonOrgMap:          (beforeOrgId: string, afterOrgId: string) => void
  setPendingMappingBeforeOrgId: (id: string | null) => void
  /** 比較モードの一時状態をすべてリセット（モード終了時に呼ぶ） */
  clearComparisonState:         () => void
}

export const useCanvasLayoutStore = create<CanvasLayoutState>()((set, get) => ({
  panels: [],

  addPanel: (orgId) => {
    if (get().panels.some(p => p.orgId === orgId)) return
    set(s => ({ panels: [...s.panels, { id: genId(), orgId }] }))
  },

  removePanel: (panelId) =>
    set(s => ({ panels: s.panels.filter(p => p.id !== panelId) })),

  reorderPanels: (orderedIds) => {
    set(s => {
      const map = new Map(s.panels.map(p => [p.id, p]))
      const next = orderedIds.flatMap(id => { const p = map.get(id); return p ? [p] : [] })
      const inOrder = new Set(orderedIds)
      const rest = s.panels.filter(p => !inOrder.has(p.id))
      return { panels: [...next, ...rest] }
    })
  },

  isInPanels: (orgId) => get().panels.some(p => p.orgId === orgId),

  clearPanels: () => set({ panels: [], comparisonPanels: [], comparisonOrgMapping: {}, pendingMappingBeforeOrgId: null }),

  // ── 比較モード ──────────────────────────────────────────────────
  comparisonMode:            false,
  comparisonPanels:          [],
  comparisonOrgMapping:      {},
  pendingMappingBeforeOrgId: null,

  toggleComparisonMode: () =>
    set(s => ({ comparisonMode: !s.comparisonMode })),

  addComparisonPanel: (beforeOrgId) => {
    if (get().comparisonPanels.some(p => p.orgId === beforeOrgId)) return
    set(s => ({ comparisonPanels: [...s.comparisonPanels, { id: genId(), orgId: beforeOrgId }] }))
  },

  removeComparisonPanel: (panelId) =>
    set(s => ({ comparisonPanels: s.comparisonPanels.filter(p => p.id !== panelId) })),

  reorderComparisonPanels: (orderedIds) => {
    set(s => {
      const map = new Map(s.comparisonPanels.map(p => [p.id, p]))
      const next = orderedIds.flatMap(id => { const p = map.get(id); return p ? [p] : [] })
      const inOrder = new Set(orderedIds)
      const rest = s.comparisonPanels.filter(p => !inOrder.has(p.id))
      return { comparisonPanels: [...next, ...rest] }
    })
  },

  isInComparisonPanels: (beforeOrgId) => get().comparisonPanels.some(p => p.orgId === beforeOrgId),

  setComparisonOrgMap: (beforeOrgId, afterOrgId) =>
    set(s => ({ comparisonOrgMapping: { ...s.comparisonOrgMapping, [beforeOrgId]: afterOrgId } })),

  setPendingMappingBeforeOrgId: (id) => set({ pendingMappingBeforeOrgId: id }),

  clearComparisonState: () =>
    set({ comparisonMode: false, comparisonPanels: [], comparisonOrgMapping: {}, pendingMappingBeforeOrgId: null }),
}))
