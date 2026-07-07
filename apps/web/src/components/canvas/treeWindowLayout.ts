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
): boolean {
  let current = panel
  let depth = 0
  while (depth++ < 30) {
    const org = orgById.get(current.orgId)
    if (!org?.parentId) return true
    const parentPanel = panelByOrgId.get(org.parentId)
    if (!parentPanel) return true
    if (parentPanel.childrenMode !== 'windowed' || !current.open) return false
    current = parentPanel
  }
  return true
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

// ── パネル仮想化（画面外パネルの非描画）用ヘルパー ─────────────────────────

/** 可視範囲判定のオーバースキャン（canvas 座標・非スケール）。パネル1個分の余白を持たせる */
export const PANEL_CULL_OVERSCAN_X = WINDOW_W
export const PANEL_CULL_OVERSCAN_Y = EST_WIN_H

export interface Rect { x1: number; y1: number; x2: number; y2: number }

export function panelRect(panel: PanelDef, winW: number, panelHeights: Record<string, number>): Rect {
  return {
    x1: panel.x,
    y1: panel.y,
    x2: panel.x + winW,
    y2: panel.y + (panelHeights[panel.id] ?? EST_WIN_H),
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

/**
 * スクローラの scrollLeft/scrollTop/clientWidth/clientHeight と canvasZoom から、
 * 現在画面に見えている canvas 座標（非スケール）の矩形を求める（オーバースキャン込み）。
 * zoom は外側ラッパーへの transform: scale() のみで適用され、panel.x/y は非スケール座標のため、
 * スクロール量（スケール後のpx）を canvasZoom で割ることで同じ非スケール座標系に変換する。
 */
export function computeVisibleRect(
  scrollLeft: number, scrollTop: number, clientWidth: number, clientHeight: number,
  canvasZoom: number,
  overscanX = PANEL_CULL_OVERSCAN_X, overscanY = PANEL_CULL_OVERSCAN_Y,
): Rect {
  return {
    x1: scrollLeft / canvasZoom - overscanX,
    y1: scrollTop / canvasZoom - overscanY,
    x2: (scrollLeft + clientWidth) / canvasZoom + overscanX,
    y2: (scrollTop + clientHeight) / canvasZoom + overscanY,
  }
}

/**
 * 指定パネルが画面中央に来るような scrollLeft/scrollTop を計算する（座標優先のスクロール先決定）。
 * パネルが DOM に無くても（仮想化で非描画でも）計算だけで求まるのがポイント。
 * 呼び出し側で 0〜(canvasWidth*zoom-clientWidth) 等の範囲にクランプすることを想定し、
 * ここでは 0 未満だけガードする。
 */
export function computeScrollToPanel(
  panel: { x: number; y: number },
  winW: number, panelH: number,
  canvasZoom: number, clientWidth: number, clientHeight: number,
): { left: number; top: number } {
  const left = panel.x * canvasZoom - (clientWidth  - winW  * canvasZoom) / 2
  const top  = panel.y * canvasZoom - (clientHeight - panelH * canvasZoom) / 2
  return { left: Math.max(0, left), top: Math.max(0, top) }
}
