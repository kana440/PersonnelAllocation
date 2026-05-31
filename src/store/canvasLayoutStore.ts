import { create } from 'zustand'

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
}

export const useCanvasLayoutStore = create<CanvasLayoutState>((set, get) => ({
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
      // Append any panels not in orderedIds (safety net)
      const inOrder = new Set(orderedIds)
      const rest = s.panels.filter(p => !inOrder.has(p.id))
      return { panels: [...next, ...rest] }
    })
  },

  isInPanels: (orgId) => get().panels.some(p => p.orgId === orgId),

  clearPanels: () => set({ panels: [] }),
}))
