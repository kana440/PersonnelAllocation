import type { CSSProperties } from 'react'
import { useReactFlow, Panel } from '@xyflow/react'
import type { Node } from '@xyflow/react'

const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5]

interface Props {
  nodes: Node[]
}

/** カメラ移動・ズームの挙動を試すための実験用ツールバー */
export function Toolbar({ nodes }: Props) {
  const { setCenter, zoomTo, getZoom } = useReactFlow()

  const focusEdge = (edge: 'left' | 'right') => {
    if (nodes.length === 0) return
    const target = nodes.reduce((best, n) =>
      edge === 'left'
        ? (n.position.x < best.position.x ? n : best)
        : (n.position.x > best.position.x ? n : best)
    )
    const w = target.width ?? 260
    const h = target.height ?? 100
    setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: getZoom(), duration: 800 })
  }

  return (
    <Panel position="top-left">
      <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 6, borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', flexWrap: 'wrap', maxWidth: 420 }}>
        <button onClick={() => focusEdge('left')}  style={btnStyle}>← 左端にフォーカス</button>
        <button onClick={() => focusEdge('right')} style={btnStyle}>右端にフォーカス →</button>
        <span style={{ width: 1, background: '#ddd' }} />
        {ZOOM_PRESETS.map(z => (
          <button key={z} onClick={() => zoomTo(z, { duration: 500 })} style={btnStyle}>
            {Math.round(z * 100)}%
          </button>
        ))}
      </div>
    </Panel>
  )
}

const btnStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#f8f8f8',
  cursor: 'pointer',
}
