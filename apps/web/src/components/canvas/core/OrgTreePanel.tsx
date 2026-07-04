import { useEffect, useLayoutEffect, useRef } from 'react'
import type React from 'react'
import type { PanelDef, CanvasPanelStyle } from '../../../store/canvasLayoutStore'
import { VIEW_MODE_WIDTHS, useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { scheduleHeightUpdate } from './panelHeightBatcher'

interface Props {
  panel:          PanelDef
  canvasPanelStyle:  CanvasPanelStyle
  isSelected?:    boolean
  /** データ属性: 'window' → after 側, 'before-window' → before 側 */
  windowKind:     'window' | 'before-window'
  setPosition:    (panelId: string, x: number, y: number) => void
  setPanelHeight: (panelId: string, height: number) => void

  /** タイトルバーを描画するコールバック。ドラッグ onMouseDown ハンドラを受け取る */
  renderHeader:    (onHeaderMouseDown: (e: React.MouseEvent) => void) => React.ReactNode
  /** コントロールバー（panel.open のとき、hasChildren なら表示する） */
  renderControls?: () => React.ReactNode
  /** パネルボディ（panel.open のとき表示） */
  renderBody:      () => React.ReactNode

  /** パネル全体のドロップ対象 handler（after 側のみ） */
  dragHandlersOuter?: {
    onDragOver:  (e: React.DragEvent) => void
    onDragLeave: () => void
    onDrop:      (e: React.DragEvent) => void
    isDragOver:  boolean
  }
}

export function OrgTreePanel({
  panel, canvasPanelStyle, isSelected, windowKind,
  setPosition, setPanelHeight,
  renderHeader, renderControls, renderBody,
  dragHandlersOuter,
}: Props) {
  const panelRef  = useRef<HTMLDivElement>(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const zoomRef   = useRef(1)
  // ドラッグ計算にのみ使用するため、レンダリングをトリガーせずに最新値を取得
  zoomRef.current = useCanvasLayoutStore.getState().canvasZoom

  // ── ResizeObserver でパネル実測高さをストアへ通知 ─────────────────
  // scheduleHeightUpdate で同一フレーム内の全パネル更新をバッチ化する
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { scheduleHeightUpdate(panel.id, el.offsetHeight, setPanelHeight) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [panel.id, setPanelHeight])

  // ── パネルドラッグ ────────────────────────────────────────────────
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragging.current  = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: panel.x, py: panel.y }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const { mx, my, px, py } = dragStart.current
      const z = zoomRef.current
      setPosition(panel.id, Math.max(0, px + (e.clientX - mx) / z), Math.max(0, py + (e.clientY - my) / z))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [panel.id, setPosition])

  const isDragOver    = dragHandlersOuter?.isDragOver ?? false
  const borderClass   = isDragOver
    ? 'border-blue-400'
    : isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-400'
  const panelWidth    = VIEW_MODE_WIDTHS[canvasPanelStyle]

  const dataProps = windowKind === 'window'
    ? { 'data-window': 'true' }
    : { 'data-before-window': 'true' }

  return (
    <div
      ref={panelRef}
      {...dataProps}
      data-panelid={panel.id}
      className={`flex flex-col rounded shadow-lg border transition-colors select-none overflow-hidden ${borderClass}`}
      style={{ background: '#ffffff', width: panelWidth, maxHeight: 'calc(100vh - 80px)' }}
      onDragOver={dragHandlersOuter?.onDragOver}
      onDragLeave={dragHandlersOuter?.onDragLeave}
      onDrop={dragHandlersOuter?.onDrop}
    >
      {renderHeader(onHeaderMouseDown)}
      {panel.open && renderControls?.()}

      {panel.open && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {renderBody()}
        </div>
      )}
    </div>
  )
}
