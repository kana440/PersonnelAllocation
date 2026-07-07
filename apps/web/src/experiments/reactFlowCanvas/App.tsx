import { useMemo } from 'react'
import { ReactFlowCanvas } from './ReactFlowCanvas'
import { generateSyntheticData } from './syntheticData'
import { buildNodesAndEdges } from './layoutAdapter'
import { OrgNode } from './OrgNode'

const ORG_COUNT = 2000
const ROW_COUNT = 30000
const nodeTypes = { orgNode: OrgNode }

export function App() {
  const { nodes, edges } = useMemo(() => {
    const t0 = performance.now()
    const { orgs, rows } = generateSyntheticData(ORG_COUNT, ROW_COUNT)
    const t1 = performance.now()
    const result = buildNodesAndEdges(orgs, rows)
    const t2 = performance.now()
    // eslint-disable-next-line no-console
    console.log(`[perf] synthetic data gen: ${(t1 - t0).toFixed(1)}ms / layout+adapt: ${(t2 - t1).toFixed(1)}ms (${result.nodes.length} nodes, ${result.edges.length} edges)`)
    return result
  }, [])

  return <ReactFlowCanvas initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} />
}
