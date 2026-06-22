import type { PanelDef }     from '../../store/canvasLayoutStore'
import type { Organization } from '@personnel/domain/schemas'

export const WINDOW_W  = 288
export const EST_WIN_H = 300   // 実測値未取得時のフォールバック
const H_GAP     = 16
const V_GAP     = 20
const MARGIN    = 40

export function isStandaloneWindow(
  panel: PanelDef,
  allPanels: PanelDef[],
  orgs: Organization[],
  ancestors = new Set<string>(),
): boolean {
  if (ancestors.has(panel.id)) return true
  const org = orgs.find(o => o.id === panel.orgId)
  if (!org?.parentId) return true
  const parentPanel = allPanels.find(p => p.orgId === org.parentId)
  if (!parentPanel) return true
  const next = new Set(ancestors)
  next.add(panel.id)
  return parentPanel.childrenMode === 'windowed'
    && panel.open
    && isStandaloneWindow(parentPanel, allPanels, orgs, next)
}

export function computeLayout(
  standalonePanels: PanelDef[],
  allPanels: PanelDef[],
  orgs: Organization[],
  panelHeights: Record<string, number>,
): Map<string, { x: number; y: number }> {
  const getParentPanel = (p: PanelDef): PanelDef | undefined => {
    const org = orgs.find(o => o.id === p.orgId)
    if (!org?.parentId) return undefined
    return standalonePanels.find(pp => pp.orgId === org.parentId)
  }

  const getChildren = (p: PanelDef): PanelDef[] =>
    standalonePanels.filter(c => {
      if (c.id === p.id) return false
      const org = orgs.find(o => o.id === c.orgId)
      return org?.parentId === p.orgId
    })

  const getPanelH = (p: PanelDef) => panelHeights[p.id] ?? EST_WIN_H

  const subtreeW = (p: PanelDef, visited = new Set<string>()): number => {
    if (visited.has(p.id)) return WINDOW_W
    const next = new Set(visited); next.add(p.id)
    const children = getChildren(p)
    if (children.length === 0) return WINDOW_W
    const total = children.reduce((s, c, i) => s + subtreeW(c, next) + (i ? H_GAP : 0), 0)
    return Math.max(WINDOW_W, total)
  }

  const posMap  = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()

  const layout = (p: PanelDef, x: number, y: number) => {
    if (visited.has(p.id)) return
    visited.add(p.id)
    const sw     = subtreeW(p)
    posMap.set(p.id, { x: Math.round(x + Math.max(0, (sw - WINDOW_W) / 2)), y })
    let cx = x
    for (const child of getChildren(p)) {
      layout(child, cx, y + getPanelH(p) + V_GAP)
      cx += subtreeW(child) + H_GAP
    }
  }

  const roots = standalonePanels.filter(p => !getParentPanel(p))
  let rootX = MARGIN
  for (const root of roots) {
    layout(root, rootX, MARGIN)
    rootX += subtreeW(root) + H_GAP
  }

  void allPanels
  return posMap
}

export function connectionPath(
  parent: PanelDef,
  child: PanelDef,
  panelHeights: Record<string, number>,
  lineStyle: 'bezier' | 'polyline',
): string {
  const parentH = panelHeights[parent.id] ?? EST_WIN_H
  const sx = parent.x + WINDOW_W / 2
  const sy = parent.y + parentH
  const tx = child.x  + WINDOW_W / 2
  const ty = child.y
  const mid = (sy + ty) / 2
  return lineStyle === 'polyline'
    ? `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx} ${mid} ${tx} ${mid} ${tx} ${ty}`
}

export interface Connection { parentPanel: PanelDef; childPanel: PanelDef }

export function buildConnections(standalonePanels: PanelDef[], orgs: Organization[]): Connection[] {
  const result: Connection[] = []
  for (const child of standalonePanels) {
    const org = orgs.find(o => o.id === child.orgId)
    if (!org?.parentId) continue
    const parent = standalonePanels.find(p => p.orgId === org.parentId)
    if (parent) result.push({ parentPanel: parent, childPanel: child })
  }
  return result
}

export const CANVAS_MARGIN = MARGIN
