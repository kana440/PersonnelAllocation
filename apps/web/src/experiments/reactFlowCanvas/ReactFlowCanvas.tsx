import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react'
import type { NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Toolbar } from './Toolbar'
import { useStore } from '../../store/useStore'
import type { Node, Edge } from '@xyflow/react'

interface Props {
  initialNodes: Node[]
  initialEdges: Edge[]
  nodeTypes:    NodeTypes
}

export function ReactFlowCanvas({ initialNodes, initialEdges, nodeTypes }: Props) {
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
        fitView
        minZoom={0.02}
        maxZoom={2}
        onlyRenderVisibleElements
      >
        <Background />
        <Controls />
        <Toolbar nodes={nodes} />
      </ReactFlow>
    </div>
  )
}
