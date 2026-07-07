import type { Node, Edge } from '@xyflow/react'
import type { Organization } from '@personnel/domain/schemas'
import type { PanelDef } from '../../store/canvasLayoutStore'
import { computeLayout, WINDOW_W } from '../../components/canvas/treeWindowLayout'

// OrgNode.tsx / RealOrgNode.tsx の実際の見た目（ヘッダー + maxHeight:260 の overflow-y-auto 本体）
// に合わせた上限。これを超えて見積もると、実際には内部スクロールで隠れる分まで
// computeLayout がパネル間隔として確保してしまい、無駄に間延びしたレイアウトになる。
export const NODE_WIDTH      = 262
export const NODE_MAX_HEIGHT = 290

// 既存キャンバスの computeLayout() をそのまま流用するための最小限のダミー PanelDef。
// x/y/open/childrenMode/collapsedOrgIds は座標計算そのものには使われない（型を満たすためだけ）。
function makeFakePanel(orgId: string): PanelDef {
  return { id: orgId, orgId, x: 0, y: 0, open: true, childrenMode: 'windowed', collapsedOrgIds: [] }
}

export interface FlowLayoutInput<D extends Record<string, unknown>> {
  orgIds:         string[]
  orgById:        Map<string, Organization>
  nodeType:       string
  /** 未実測時の高さ見積もり（NODE_MAX_HEIGHT で内部的に頭打ちにする） */
  estimateHeight: (orgId: string) => number
  buildData:      (orgId: string) => D
}

/**
 * 組織ID一覧 → 既存 computeLayout()（本番キャンバスと同じ木構造レイアウト）で座標計算
 * → React Flow の Node[]/Edge[] に変換する共通処理。
 * Phase 0（合成データのみ）・Phase 1（実データ・実RowCard）の両方から使う。
 */
export function buildFlowLayout<D extends Record<string, unknown>>(
  { orgIds, orgById, nodeType, estimateHeight, buildData }: FlowLayoutInput<D>,
): { nodes: Node<D>[]; edges: Edge[] } {
  const panelHeights: Record<string, number> = {}
  for (const orgId of orgIds) panelHeights[orgId] = Math.min(NODE_MAX_HEIGHT, estimateHeight(orgId))

  const panels = orgIds.map(makeFakePanel)
  const posMap = computeLayout(panels, orgById, panelHeights, WINDOW_W)

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

  return { nodes, edges }
}
