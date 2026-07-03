import type { PanelDef }     from '../../store/canvasLayoutStore'
import type { Organization } from '@personnel/domain/schemas'

export const WINDOW_W  = 288
export const EST_WIN_H = 300
const H_GAP  = 16
const V_GAP  = 20
const MARGIN = 40

/**
 * panels 配列から orgId → PanelDef の Map を構築する。
 * Canvas 側で一度だけ構築し、全計算に渡すことで O(N) 検索を O(1) に削減する。
 */
export function buildPanelByOrgIdMap(panels: PanelDef[]): Map<string, PanelDef> {
  return new Map(panels.map(p => [p.orgId, p]))
}

/** Organization 配列から orgId → Organization の Map を構築する */
export function buildOrgByIdMap(orgs: Organization[]): Map<string, Organization> {
  return new Map(orgs.map(o => [o.id, o]))
}

export function isStandaloneWindow(
  panel:        PanelDef,
  panelByOrgId: Map<string, PanelDef>,
  orgById:      Map<string, Organization>,
  ancestors = new Set<string>(),
): boolean {
  if (ancestors.has(panel.id)) return true
  const org = orgById.get(panel.orgId)
  if (!org?.parentId) return true
  const parentPanel = panelByOrgId.get(org.parentId)
  if (!parentPanel) return true
  const next = new Set(ancestors); next.add(panel.id)
  return parentPanel.childrenMode === 'windowed'
    && panel.open
    && isStandaloneWindow(parentPanel, panelByOrgId, orgById, next)
}

export function computeLayout(
  standalonePanels: PanelDef[],
  orgById:          Map<string, Organization>,
  panelHeights:     Record<string, number>,
  windowW = WINDOW_W,
): Map<string, { x: number; y: number }> {
  const standaloneByOrgId = buildPanelByOrgIdMap(standalonePanels)

  // O(N) で子パネル Map を事前構築（元の filter は O(N) × N ノード = O(N²)）
  const childrenByOrgId = new Map<string, PanelDef[]>()
  for (const p of standalonePanels) {
    const parentOrgId = orgById.get(p.orgId)?.parentId
    if (!parentOrgId) continue
    const arr = childrenByOrgId.get(parentOrgId)
    if (arr) arr.push(p)
    else childrenByOrgId.set(parentOrgId, [p])
  }

  const getParent = (p: PanelDef): PanelDef | undefined => {
    const parentOrgId = orgById.get(p.orgId)?.parentId
    return parentOrgId ? standaloneByOrgId.get(parentOrgId) : undefined
  }
  const getChildren = (p: PanelDef): PanelDef[] => childrenByOrgId.get(p.orgId) ?? []
  const getPanelH   = (p: PanelDef) => panelHeights[p.id] ?? EST_WIN_H

  // subtreeW をメモ化して O(N) に（元は各ノードで再帰的に再計算）
  const subtreeWCache = new Map<string, number>()
  const subtreeW = (p: PanelDef): number => {
    const cached = subtreeWCache.get(p.id)
    if (cached !== undefined) return cached
    const children = getChildren(p)
    const w = children.length === 0
      ? windowW
      : Math.max(windowW, children.reduce((s, c, i) => s + subtreeW(c) + (i ? H_GAP : 0), 0))
    subtreeWCache.set(p.id, w)
    return w
  }

  const posMap  = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()

  const layout = (p: PanelDef, x: number, y: number) => {
    if (visited.has(p.id)) return
    visited.add(p.id)
    const sw = subtreeW(p)
    posMap.set(p.id, { x: Math.round(x + Math.max(0, (sw - windowW) / 2)), y })
    let cx = x
    for (const child of getChildren(p)) {
      layout(child, cx, y + getPanelH(p) + V_GAP)
      cx += subtreeW(child) + H_GAP
    }
  }

  const roots = standalonePanels.filter(p => !getParent(p))
  let rootX = MARGIN
  for (const root of roots) {
    layout(root, rootX, MARGIN)
    rootX += subtreeW(root) + H_GAP
  }

  return posMap
}

export function connectionPath(
  parent: PanelDef,
  child: PanelDef,
  panelHeights: Record<string, number>,
  lineStyle: 'bezier' | 'polyline',
  windowW = WINDOW_W,
): string {
  const parentH = panelHeights[parent.id] ?? EST_WIN_H
  const sx = parent.x + windowW / 2
  const sy = parent.y + parentH
  const tx = child.x  + windowW / 2
  const ty = child.y
  const mid = (sy + ty) / 2
  return lineStyle === 'polyline'
    ? `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx} ${mid} ${tx} ${mid} ${tx} ${ty}`
}

export interface Connection { parentPanel: PanelDef; childPanel: PanelDef }

export function buildConnections(standalonePanels: PanelDef[], orgById: Map<string, Organization>): Connection[] {
  const panelByOrgId = buildPanelByOrgIdMap(standalonePanels)
  const result: Connection[] = []
  for (const child of standalonePanels) {
    const parentOrgId = orgById.get(child.orgId)?.parentId
    if (!parentOrgId) continue
    const parent = panelByOrgId.get(parentOrgId)
    if (parent) result.push({ parentPanel: parent, childPanel: child })
  }
  return result
}

export const CANVAS_MARGIN = MARGIN
