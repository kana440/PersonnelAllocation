import { usePanelScroll } from '../core/PanelScrollContext'
import { useVirtualRowWindow } from '../core/useVirtualRowWindow'
import { RowCard } from './RowCard'
import type { PositionEntry } from '../OrgViewContext'

// RowCard は表示チップ数で高さが変わるため厳密な実測はしない。固定推定値＋大きめの
// オーバースキャン（useVirtualRowWindow の ROW_BUFFER）で吸収する。
const EST_ROW_H = 60

interface Props {
  items:   PositionEntry[]
  orgId:   string
  panelId: string
}

/**
 * パネル内・行単位の仮想化（Tier 1: パネル自身のルート組織の直属行のみ）。
 * パネル本体のスクロール位置に応じて RowCard を間引いて描画する。
 */
export function VirtualRowList({ items, orgId, panelId }: Props) {
  const { scrollerRef } = usePanelScroll()
  const { startIdx, endIdx, paddingTop, paddingBottom } = useVirtualRowWindow(scrollerRef, items.length, EST_ROW_H)
  const visibleItems = items.slice(startIdx, endIdx)

  return (
    <>
      {paddingTop > 0 && <div style={{ height: paddingTop }} aria-hidden />}
      {visibleItems.map(entry => (
        <RowCard key={entry.row.rowId} entry={entry} orgId={orgId} panelId={panelId} />
      ))}
      {paddingBottom > 0 && <div style={{ height: paddingBottom }} aria-hidden />}
    </>
  )
}
