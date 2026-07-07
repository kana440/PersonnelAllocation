import { useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useOrgView } from '../../components/canvas/OrgViewContext'
import { RowCard } from '../../components/canvas/panel/RowCard'
import { useVirtualRowWindow } from '../../components/canvas/core/useVirtualRowWindow'

const ROW_H = 60 // RowCard の推定高さ（本番の heightEstimate.ts の EST_ROW_H と同じ考え方）

export interface RealOrgNodeData extends Record<string, unknown> {
  name: string
}

/**
 * 本物の RowCard を React Flow ノードとして描画する（Phase 1）。
 * className="nodrag" が必須: React Flow のノードドラッグ（d3-drag）は mousedown を
 * バブリングで捕捉してブラウザのネイティブ dragstart を preventDefault してしまうため、
 * これが無いと RowCard の HTML5 ドラッグ&ドロップ（異動操作）が発火しなくなる。
 */
export function RealOrgNode({ id, data }: { id: string; data: RealOrgNodeData }) {
  const { positionTreeByOrgId } = useOrgView()
  const entries = positionTreeByOrgId.get(id) ?? []

  const scrollerRef = useRef<HTMLDivElement>(null)
  const { startIdx, endIdx, paddingTop, paddingBottom } = useVirtualRowWindow(scrollerRef, entries.length, ROW_H)
  const visibleEntries = entries.slice(startIdx, endIdx)

  return (
    <div className="nodrag" style={{ width: 260, border: '1px solid #93a3b8', borderRadius: 6, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '4px 8px', background: '#3c7abf', color: '#fff', fontSize: 11, fontWeight: 600 }}>
        {data.name}（{entries.length}名）
      </div>
      <div ref={scrollerRef} style={{ maxHeight: 260, overflowY: 'auto' }}>
        {paddingTop > 0 && <div style={{ height: paddingTop }} />}
        {visibleEntries.map(entry => (
          <RowCard key={entry.row.rowId} entry={entry} orgId={id} panelId={id} />
        ))}
        {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
        {entries.length === 0 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: '#aaa' }}>（メンバーなし）</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
