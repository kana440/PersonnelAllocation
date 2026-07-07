import { useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useVirtualRowWindow } from '../../components/canvas/core/useVirtualRowWindow'
import type { SyntheticRow } from './syntheticData'

// 業務ロジックを含まない最小限のノード。ヘッダー＋行一覧（多い場合は内部も仮想化）だけ。
const ROW_H = 22

export interface OrgNodeData extends Record<string, unknown> {
  name: string
  rows: SyntheticRow[]
}

export function OrgNode({ data }: { data: OrgNodeData }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { startIdx, endIdx, paddingTop, paddingBottom } = useVirtualRowWindow(scrollerRef, data.rows.length, ROW_H)
  const visibleRows = data.rows.slice(startIdx, endIdx)

  return (
    <div style={{ width: 260, border: '1px solid #93a3b8', borderRadius: 6, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '4px 8px', background: '#3c7abf', color: '#fff', fontSize: 11, fontWeight: 600 }}>
        {data.name}（{data.rows.length}名）
      </div>
      <div ref={scrollerRef} style={{ maxHeight: 260, overflowY: 'auto' }}>
        {paddingTop > 0 && <div style={{ height: paddingTop }} />}
        {visibleRows.map(r => (
          <div key={r.rowId} style={{ padding: '2px 8px', fontSize: 10, borderBottom: '1px solid #eee', color: '#333' }}>
            {r.name}
          </div>
        ))}
        {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
        {data.rows.length === 0 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: '#aaa' }}>（メンバーなし）</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
