import { useMemo, useEffect, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useOrgView } from '../OrgViewContext'
import { estimateTreeBodyHeight, EST_HEADER_H } from '../panel/heightEstimate'
import { buildFlowLayout, collectDescendantIds, NODE_MAX_HEIGHT } from './buildFlowLayout'
import { OrgOverviewNode } from './OrgOverviewNode'
import type { OrgOverviewNodeData } from './OrgOverviewNode'

const nodeTypes = { orgOverviewNode: OrgOverviewNode }

function InitialFocus({ nodeIds }: { nodeIds: string[] }) {
  const { fitView } = useReactFlow()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || nodeIds.length === 0) return
    done.current = true
    requestAnimationFrame(() => {
      fitView({ nodes: nodeIds.map(id => ({ id })), duration: 0, padding: 2, maxZoom: 1 })
    })
  }, [nodeIds, fitView])
  return null
}

/**
 * ツリー表示・比較モードなし（Phase A スコープ）向けのキャンバス本体。
 * `panels`（windowed のみ）から React Flow の Node/Edge を組み立てて描画する。
 * 業務ロジック（ドラッグ&ドロップ・選択・追加操作等）は OrgViewContext 経由でそのまま
 * 本番の実装（useOrgDrag・usePersonSelection 等、OrgOperationView が既に組み立て済み）を使う。
 */
export function FlowCanvas() {
  const { panels } = useCanvasLayoutStore(useShallow(s => ({ panels: s.panels })))
  const { orgById, childrenByOrgId, positionTreeByOrgId, clearSelection } = useOrgView()

  // 「開いている」組織（既定ではルートのみ。ナビ等から個別に開いたものも含む）は、
  // 配下の全組織を丸ごと連結ノードとして見せる。旧実装の windowed/inline の区別は
  // 大量の独立ウィンドウを避けるためのDOM都合の分類だったが、React Flow の
  // 仮想化下では不要（可視分だけしか実描画されないため）。
  const orgIds = useMemo(() => {
    const result = new Set<string>()
    for (const p of panels) {
      if (!p.open) continue
      result.add(p.orgId)
      for (const descId of collectDescendantIds(p.orgId, childrenByOrgId)) result.add(descId)
    }
    return [...result]
  }, [panels, childrenByOrgId])

  // 高さは組織ごとの行数見積もり（本番と同じ estimateTreeBodyHeight）で一度だけ計算する。
  // buildFlowLayout の座標計算(computeLayout)にも、ノード側の描画にも同じ値を使うことで、
  // 両者がズレて重なる・間延びするということが起きないようにする（data.height 経由で共有）。
  const computeHeight = useCallback(
    (orgId: string) => EST_HEADER_H + estimateTreeBodyHeight(positionTreeByOrgId.get(orgId)?.length ?? 0),
    [positionTreeByOrgId],
  )

  const { nodes: initialNodes, edges: initialEdges, rootNodeIds } = useMemo(() =>
    buildFlowLayout<OrgOverviewNodeData>({
      orgIds, orgById,
      nodeType:       'orgOverviewNode',
      estimateHeight: computeHeight,
      buildData:      orgId => ({ orgId, height: Math.min(NODE_MAX_HEIGHT, computeHeight(orgId)) }),
    })
  , [orgIds, orgById, computeHeight])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // useNodesState の初期値は初回のみ有効（useState と同じ）。パネルの開閉で orgIds が
  // 変わったときに反映するため、新規に開かれた分だけ「見積もり高さ」で追加し、
  // 閉じられた分だけ除去する。既存ノードの height/position は保持する — 実際の高さ・
  // 位置は OrgOverviewNode 自身が実測（ResizeObserver）して子孫を局所シフトする方式に
  // 一本化しており、ここで見積もり値に巻き戻すと実測結果を上書きしてしまうため。
  useEffect(() => {
    const freshById = new Map(initialNodes.map(n => [n.id, n]))
    setNodes(current => {
      const currentIds = new Set(current.map(n => n.id))
      const kept  = current.filter(n => freshById.has(n.id))
      const added = initialNodes.filter(n => !currentIds.has(n.id))
      return [...kept, ...added]
    })
    setEdges(initialEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => clearSelection()}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        onlyRenderVisibleElements
      >
        <Background />
        <Controls />
        <InitialFocus nodeIds={rootNodeIds} />
      </ReactFlow>
    </div>
  )
}
