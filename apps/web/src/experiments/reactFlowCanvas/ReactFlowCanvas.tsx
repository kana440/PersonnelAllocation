import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react'
import type { NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Toolbar } from './Toolbar'
import { InitialFocus } from './InitialFocus'
import { useStore } from '../../store/useStore'
import type { Node, Edge } from '@xyflow/react'

interface Props {
  initialNodes: Node[]
  initialEdges: Edge[]
  nodeTypes:    NodeTypes
  /** 初回表示でフィットするノード（通常はルート組織）。全ノードに fitView すると
   *  onlyRenderVisibleElements が無効化されてしまうため対象を絞る */
  rootNodeIds:  string[]
}

export function ReactFlowCanvas({ initialNodes, initialEdges, nodeTypes, rootNodeIds }: Props) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // 空白部分クリックで選択解除できるか確認（本番の Esc/マーキー解除に相当する動作）
  const clearAllSelection = useStore(s => s.clearAllSelection)

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => {
          // eslint-disable-next-line no-console
          console.log('[phase1] onPaneClick fired → clearAllSelection')
          clearAllSelection()
        }}
        nodeTypes={nodeTypes}
        // fitView（全ノード対象）は使わない: 全ノードが画面に収まるようズームアウトしてしまい、
        // onlyRenderVisibleElements（画面外を描画しない）が「全部画面内」と判定して
        // 実質無効化されてしまう（2000ノード全部が初回マウントされ致命的に重くなる）。
        // 代わりに InitialFocus でルート組織だけに fitView する。
        minZoom={0.02}
        maxZoom={2}
        onlyRenderVisibleElements
      >
        <Background />
        <Controls />
        <Toolbar nodes={nodes} />
        <InitialFocus nodeIds={rootNodeIds} />
      </ReactFlow>
    </div>
  )
}
