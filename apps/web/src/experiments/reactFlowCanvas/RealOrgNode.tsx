import { useRef, useEffect } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { useOrgView } from '../../components/canvas/OrgViewContext'
import { RowCard } from '../../components/canvas/panel/RowCard'
import { useVirtualRowWindow } from '../../components/canvas/core/useVirtualRowWindow'
import { EST_HEADER_H, EST_ROW_H } from '../../components/canvas/panel/heightEstimate'
import { NODE_MAX_HEIGHT, collectDescendantIds } from './buildFlowLayout'

const ROW_H = EST_ROW_H // RowCard の推定高さ（本番の heightEstimate.ts と同じ値を共有）

export interface RealOrgNodeData extends Record<string, unknown> {
  name: string
}

/**
 * 本物の RowCard を React Flow ノードとして描画する（Phase 1）。
 * className="nodrag" が必須: React Flow のノードドラッグ（d3-drag）は mousedown を
 * バブリングで捕捉してブラウザのネイティブ dragstart を preventDefault してしまうため、
 * これが無いと RowCard の HTML5 ドラッグ&ドロップ（異動操作）が発火しなくなる。
 *
 * 高さは全ノード共通の固定値（NODE_MAX_HEIGHT）で初期化される。マウントされた
 * （＝ onlyRenderVisibleElements により画面内に入った）ノードだけが実際の在籍人数から
 * 実高さを算出し、固定値と異なれば自分の height と子孫ノードの position.y を
 * その場で調整する（全体の computeLayout は再実行しない）。
 */
export function RealOrgNode({ id, data }: { id: string; data: RealOrgNodeData }) {
  const { positionTreeByOrgId, childrenByOrgId } = useOrgView()
  const entries = positionTreeByOrgId.get(id) ?? []

  const scrollerRef = useRef<HTMLDivElement>(null)
  const { startIdx, endIdx, paddingTop, paddingBottom } = useVirtualRowWindow(scrollerRef, entries.length, ROW_H)
  const visibleEntries = entries.slice(startIdx, endIdx)

  const realHeight = Math.min(NODE_MAX_HEIGHT, EST_HEADER_H + Math.max(1, entries.length) * ROW_H)
  const { getNode, setNodes } = useReactFlow()

  useEffect(() => {
    const current = getNode(id)
    if (!current || current.height === realHeight) return
    const delta = realHeight - (current.height ?? realHeight)
    const descendantIds = collectDescendantIds(id, childrenByOrgId)
    setNodes(nds => nds.map(n => {
      if (n.id === id) return { ...n, height: realHeight }
      if (descendantIds.has(n.id)) return { ...n, position: { ...n.position, y: n.position.y + delta } }
      return n
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, realHeight, childrenByOrgId])

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
