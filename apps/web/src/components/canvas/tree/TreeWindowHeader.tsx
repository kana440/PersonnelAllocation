import { useEffect, useRef, useCallback } from 'react'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { AddRowDropdown }       from '../AddRowDropdown'
import type { Organization }    from '@personnel/domain/schemas'

interface TreeWindowHeaderProps {
  panel:           PanelDef
  rootPath:        string[]
  organizations:   Organization[]
  currentOrg:      Organization | undefined
  totalCount:      number
  headerBg:        string
  onToggleOpen:    () => void
  onNavigateToIdx: (idx: number) => void
}

export function TreeWindowHeader({
  panel, rootPath, organizations, currentOrg, totalCount,
  headerBg, onToggleOpen, onNavigateToIdx,
}: TreeWindowHeaderProps) {
  const { setPosition, canvasZoom, panelViewMode, togglePanelViewMode } = useCanvasLayoutStore()
  const selectOrg = useStore(s => s.selectOrg)

  // ── ウィンドウドラッグ ─────────────────────────────────────────
  const dragging    = useRef(false)
  const dragOrigin  = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const zoomRef     = useRef(canvasZoom)
  zoomRef.current   = canvasZoom

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragging.current   = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: panel.x, py: panel.y }
  }, [panel.x, panel.y])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const { mx, my, px, py } = dragOrigin.current
      const z = zoomRef.current
      setPosition(panel.id, Math.max(0, px + (e.clientX - mx) / z), Math.max(0, py + (e.clientY - my) / z))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panel.id, setPosition])

  return (
    <div
      onMouseDown={onTitleMouseDown}
      onClick={() => selectOrg(panel.orgId)}
      className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
      style={{ background: headerBg, userSelect: 'none' }}
    >
      <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
        <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
          {rootPath.length > 1 ? (
            rootPath.map((id, i) => {
              const o      = organizations.find(o => o.id === id)
              const isLast = i === rootPath.length - 1
              return (
                <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                  {i > 0 && <span className="text-blue-300 text-[9px]">/</span>}
                  <button
                    onClick={() => onNavigateToIdx(i)}
                    className={`text-[10px] max-w-[5rem] truncate ${
                      isLast ? 'font-semibold text-white cursor-default' : 'text-blue-200 hover:text-white'
                    }`}
                  >{o?.name ?? id}</button>
                </span>
              )
            })
          ) : (
            <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? panel.orgId}</span>
          )}
          <span className="text-[10px] text-blue-200 flex-shrink-0 ml-0.5">({totalCount})</span>
          <AddRowDropdown orgCode={currentOrg?.externalCode ?? ''} variant="header" />
        </div>
        <div className="flex items-center flex-shrink-0">
          {/* バンド別表示トグル */}
          <button
            onClick={e => { e.stopPropagation(); togglePanelViewMode() }}
            title={panelViewMode === 'band' ? 'ツリー表示に切り替え' : 'バンド別表示に切り替え'}
            className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded transition-colors ${
              panelViewMode === 'band'
                ? 'text-white bg-blue-500 hover:bg-blue-400'
                : 'text-blue-300 hover:text-white hover:bg-blue-700'
            }`}
          >⊞</button>

          {rootPath.length > 1 && (
            <button
              onClick={() => onNavigateToIdx(rootPath.length - 2)}
              className="w-5 h-5 flex items-center justify-center text-[10px] text-blue-200 hover:text-white hover:bg-blue-700 rounded transition-colors"
              title="一つ上へ"
            >↑</button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onToggleOpen() }}
            title={panel.open ? '折りたたむ' : '展開'}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-blue-700 text-xs transition-colors"
          >{panel.open ? '─' : '▲'}</button>
        </div>
      </div>

    </div>
  )
}
