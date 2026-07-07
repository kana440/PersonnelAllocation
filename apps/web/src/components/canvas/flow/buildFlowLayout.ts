import type { Node, Edge } from '@xyflow/react'
import type { Organization } from '@personnel/domain/schemas'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { computeLayout, WINDOW_W } from '../treeWindowLayout'

export const NODE_WIDTH = WINDOW_W
// 実測後も含めた上限キャップ（メガ組織はこれ以上大きくならず内部スクロールになる）。
// 実際の RowCard は差分チップ等で単純な見積もり行より高くなるため、大きめに取っている。
export const NODE_MAX_HEIGHT = 520

// 既存の computeLayout() をそのまま流用するための最小限のダミー PanelDef。
// x/y/open/childrenMode/collapsedOrgIds は座標計算そのものには使われない（型を満たすためだけ）。
function makeFakePanel(orgId: string): PanelDef {
  return { id: orgId, orgId, x: 0, y: 0, open: true, childrenMode: 'windowed', collapsedOrgIds: [] }
}

export interface FlowLayoutInput<D extends Record<string, unknown>> {
  orgIds:         string[]
  orgById:        Map<string, Organization>
  nodeType:       string
  /** 組織ごとの高さ見積もり（行数ベース等）。NODE_MAX_HEIGHT で内部的に頭打ちにする */
  estimateHeight: (orgId: string) => number
  buildData:      (orgId: string) => D
}

/**
 * 組織ID一覧 → 既存 computeLayout()（本番キャンバスと同じ木構造レイアウト）で座標計算
 * → React Flow の Node[]/Edge[] に変換する共通処理。
 */
export function buildFlowLayout<D extends Record<string, unknown>>(
  { orgIds, orgById, nodeType, estimateHeight, buildData }: FlowLayoutInput<D>,
): { nodes: Node<D>[]; edges: Edge[]; rootNodeIds: string[] } {
  const panelHeights: Record<string, number> = {}
  for (const orgId of orgIds) panelHeights[orgId] = Math.min(NODE_MAX_HEIGHT, estimateHeight(orgId))

  const panels = orgIds.map(makeFakePanel)
  const posMap = computeLayout(panels, orgById, panelHeights, NODE_WIDTH)

  const nodes: Node<D>[] = orgIds.map(orgId => ({
    id:       orgId,
    type:     nodeType,
    position: posMap.get(orgId) ?? { x: 0, y: 0 },
    width:    NODE_WIDTH,
    height:   panelHeights[orgId],
    data:     buildData(orgId),
  }))

  const orgIdSet = new Set(orgIds)
  const edges: Edge[] = orgIds
    .map(id => orgById.get(id))
    .filter((o): o is Organization => !!o?.parentId && orgIdSet.has(o.parentId))
    .map(o => ({ id: `${o.parentId}-${o.id}`, source: o.parentId!, target: o.id }))

  // 祖先を持たない（＝親が集合に含まれない）ノード。InitialFocus で最初にフィットする対象。
  const rootNodeIds = orgIds.filter(id => {
    const parentId = orgById.get(id)?.parentId
    return !parentId || !orgIdSet.has(parentId)
  })

  return { nodes, edges, rootNodeIds }
}

/**
 * 指定した組織の子孫ノードID全体（自身は含まない）を childrenByOrgId（Map）で辿って集める。
 * ある組織の実測高さが変わったとき、位置をずらす対象を求めるために使う
 * （兄弟・祖先は組織の「高さ」には依存しないため対象外でよい）。
 */
export function collectDescendantIds(orgId: string, childrenByOrgId: Map<string, Organization[]>): Set<string> {
  const result = new Set<string>()
  const queue = [orgId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of childrenByOrgId.get(current) ?? []) {
      if (result.has(child.id)) continue
      result.add(child.id)
      queue.push(child.id)
    }
  }
  return result
}
