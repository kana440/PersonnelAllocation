import { useRef, useLayoutEffect, useCallback } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { isSecondmentOrg } from '@personnel/domain/rules/derive'
import { useOrgView } from '../OrgViewContext'
import { useStore } from '../../../store/useStore'
import { AddRowDropdown } from '../AddRowDropdown'
import { RowCard } from '../panel/RowCard'
import { PanelScrollContext } from '../core/PanelScrollContext'
import { useVirtualRowWindow } from '../core/useVirtualRowWindow'
import { EST_ROW_H } from '../panel/heightEstimate'
import { NODE_WIDTH, NODE_MAX_HEIGHT, collectDescendantIds } from './buildFlowLayout'

export interface OrgOverviewNodeData extends Record<string, unknown> {
  orgId:  string
  /** FlowCanvas 側の見積もり高さ。実測されるまでの初期配置にのみ使う */
  height: number
}

/**
 * ツリー表示・単一キャンバス（比較モードなし）向けの React Flow ノード（Phase A）。
 * 中身は本番の RowCard・useOrgDrag ハンドラ（OrgViewContext 経由）をそのまま再利用する。
 *
 * ドラッグの二重系統に注意:
 * - ヘッダー/外枠は無印（React Flow 自身のノードドラッグでボックスを再配置できる。
 *   旧 OrgTreePanel の手製 mousedown ドラッグに代わるもの）
 * - 行一覧（RowCard 群）だけ className="nodrag" で React Flow のドラッグ捕捉から除外する
 *   （RowCard の HTML5 ネイティブドラッグ&ドロップ＝異動操作を機能させるため）
 * - onDragOver/onDrop（組織への人物ドロップ）は native HTML5 DnD の別イベントなので
 *   nodrag の有無に関係なく外枠全体で有効にできる
 *
 * 高さは固定値を強制しない。外枠は maxHeight（上限）だけを持ち、中身が少なければ
 * 自然に縮み、多ければ内部スクロールになる（CSS の自然なサイズ決定に任せる）。
 * 実際に描画された高さは ResizeObserver で測り、見積もりと異なれば自分の height と
 * 子孫ノードの position.y をその場で調整する（全体の computeLayout は再実行しない。
 * 子孫だけが対象で兄弟・祖先は影響を受けない）。
 */
export function OrgOverviewNode({ id }: { id: string; data: OrgOverviewNodeData }) {
  const {
    orgById, childrenByOrgId, positionTreeByOrgId, subtreeCountByOrgId,
    dragOverOrgId, highlightedOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()
  const masters = useStore(s => s.masters)

  const org = orgById.get(id)
  const entries = positionTreeByOrgId.get(id) ?? []
  const totalCount = subtreeCountByOrgId.get(id) ?? entries.length

  const hasRows = (subtreeCountByOrgId.get(id) ?? 0) > 0
  const isSecondment = org?.externalCode ? isSecondmentOrg(org.externalCode, masters) : false
  const headerBg = isSecondment ? '#2e7d52' : !hasRows ? '#b54520' : '#3c7abf'
  const isDragOver = dragOverOrgId === id
  const isHighlighted = highlightedOrgId === id

  const nodeRef    = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { startIdx, endIdx, paddingTop, paddingBottom } = useVirtualRowWindow(scrollerRef, entries.length, EST_ROW_H)
  const visibleEntries = entries.slice(startIdx, endIdx)

  const { getNode, setNodes } = useReactFlow()

  // 外枠(ヘッダー+ボディ)の実際の描画サイズを測り、見積もりと違えば自分の height と
  // 子孫だけの position.y を差分ぶんずらす。row の中身（差分チップ等）が変わるたびに
  // ResizeObserver が発火するので、都度追従する。
  useLayoutEffect(() => {
    const el = nodeRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      // offsetHeight はレイアウト上のサイズ（フロー座標系）で、React Flow のズーム(CSS transform
      // scale)の影響を受けない。getBoundingClientRect() は画面上の見た目のサイズ(ズーム後)を
      // 返してしまうため、node.height（フロー座標系の値）に渡すと拡大率によって値がズレる。
      const measured = el.offsetHeight
      const current = getNode(id)
      if (!current || current.height === measured) return
      const delta = measured - (current.height ?? measured)
      const descendantIds = collectDescendantIds(id, childrenByOrgId)
      setNodes(nds => nds.map(n => {
        if (n.id === id) return { ...n, height: measured }
        if (descendantIds.has(n.id)) return { ...n, position: { ...n.position, y: n.position.y + delta } }
        return n
      }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, childrenByOrgId, getNode, setNodes])

  const onDragOver = useCallback((e: React.DragEvent) => handleDragOver(e, id), [handleDragOver, id])
  const onDrop     = useCallback((e: React.DragEvent) => handleDrop(e, id), [handleDrop, id])

  const borderClass = isDragOver
    ? 'border-blue-400'
    : isHighlighted ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-400'

  return (
    <div
      ref={nodeRef}
      className={`flex flex-col rounded shadow-lg border overflow-hidden ${borderClass}`}
      style={{ width: NODE_WIDTH, maxHeight: NODE_MAX_HEIGHT, background: '#fff' }}
      onDragOver={onDragOver}
      onDragLeave={handleDragLeave}
      onDrop={onDrop}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex-shrink-0 flex items-center gap-1 px-2" style={{ height: 28, background: headerBg }}>
        <span className="flex-1 text-xs font-semibold text-white truncate">{org?.name ?? id}</span>
        <span className="text-[10px] text-blue-100 flex-shrink-0">({totalCount})</span>
        <AddRowDropdown orgCode={org?.externalCode ?? ''} variant="header" />
      </div>

      <div ref={scrollerRef} className="nodrag flex-1 min-h-0 overflow-y-auto p-1">
        <PanelScrollContext.Provider value={{ scrollerRef }}>
          {paddingTop > 0 && <div style={{ height: paddingTop }} aria-hidden />}
          {visibleEntries.map(entry => (
            <RowCard key={entry.row.rowId} entry={entry} orgId={id} panelId={id} />
          ))}
          {paddingBottom > 0 && <div style={{ height: paddingBottom }} aria-hidden />}
          {entries.length === 0 && (
            <div className="text-[10px] text-gray-400 text-center py-2">メンバーなし</div>
          )}
        </PanelScrollContext.Provider>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
