import { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { useStore }             from '../../store/useStore'
import { useOrgView }           from './OrgViewContext'
import { TreeWindow }           from './tree'
import { useCanvasScroll }      from './hooks/useCanvasScroll'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import {
  WINDOW_W, EST_WIN_H, CANVAS_MARGIN,
  isStandaloneWindow, computeLayout, connectionPath, buildConnections,
} from './treeWindowLayout'

export function TreeWindowCanvas() {
  const {
    panels, setPositions,
    autoArrange, setAutoArrange,
    lineStyle, setLineStyle,
    panelHeights,
    triggerComparisonArrange,
    canvasZoom, setCanvasZoom, stepCanvasZoom,
  } = useCanvasLayoutStore()
  const selectedOrgId     = useStore(s => s.selectedOrgId)
  const { organizations } = useOrgView()

  // ── スタンドアロンパネルと表示座標 ───────────────────────────────
  const standalonePanels = useMemo(
    () => panels.filter(p => isStandaloneWindow(p, panels, organizations)),
    [panels, organizations],
  )

  const displayPanels = useMemo(() => {
    if (!autoArrange) return standalonePanels
    const posMap = computeLayout(standalonePanels, panels, organizations, panelHeights)
    return standalonePanels.map(p => {
      const pos = posMap.get(p.id)
      return pos ? { ...p, ...pos } : p
    })
  }, [autoArrange, standalonePanels, panels, organizations, panelHeights])

  const connections = useMemo(
    () => buildConnections(displayPanels, organizations),
    [displayPanels, organizations],
  )

  const canvasWidth  = displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + WINDOW_W + CANVAS_MARGIN * 2))
  const canvasHeight = displayPanels.length === 0 ? 800
    : Math.max(800, ...displayPanels.map(p => p.y + (panelHeights[p.id] ?? EST_WIN_H) + CANVAS_MARGIN * 2))

  // ── 整列ボタン ──────────────────────────────────────────────────
  const handleArrange = useCallback(() => {
    setPositions(computeLayout(standalonePanels, panels, organizations, panelHeights))
    triggerComparisonArrange()
  }, [standalonePanels, panels, organizations, panelHeights, setPositions, triggerComparisonArrange])

  const handleAutoArrangeChange = useCallback((checked: boolean) => {
    if (!checked) setPositions(computeLayout(standalonePanels, panels, organizations, panelHeights))
    setAutoArrange(checked)
    if (checked) triggerComparisonArrange()
  }, [standalonePanels, panels, organizations, panelHeights, setPositions, setAutoArrange, triggerComparisonArrange])

  // ── スクロール（人物・組織）────────────────────────────────────
  const { scrollerRef }                              = useCanvasScroll(displayPanels, organizations)
  const { spaceHeld, panning, band, handleCanvasMouseDown } = useCanvasInteraction(scrollerRef)

  // ── Ctrl+Wheel ズーム ─────────────────────────────────────────
  // displayPanels.length > 0 を dep に含めることで、Excel 読込後にスクローラーが
  // 現れたタイミングで effect を再実行し、リスナーを正しく登録する
  const hasCanvasContent = displayPanels.length > 0
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      stepCanvasZoom(e.deltaY < 0 ? 0.1 : -0.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasCanvasContent, stepCanvasZoom])

  // ── ズームプリセットドロップダウン ────────────────────────────
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false)
  const zoomDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!zoomDropdownOpen) return
    const onDown = (e: MouseEvent) => {
      if (!zoomDropdownRef.current?.contains(e.target as Node)) setZoomDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [zoomDropdownOpen])

  if (displayPanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Excel を読み込むと組織が表示されます
      </div>
    )
  }

  return (
    <div className="relative h-full">
      {/* ツールバー（右上固定） */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-2">
        <label className="flex items-center gap-1 cursor-pointer select-none px-2 h-[26px] border border-gray-300 bg-white rounded shadow-sm">
          <input
            type="checkbox"
            checked={autoArrange}
            onChange={e => handleAutoArrangeChange(e.target.checked)}
            className="w-3 h-3 accent-blue-600"
          />
          <span className="text-[11px] text-gray-600">自動整列</span>
        </label>
        <button
          onClick={handleArrange}
          disabled={autoArrange}
          className="px-2.5 py-1 text-[11px] font-medium rounded border shadow-sm transition-colors border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400 disabled:text-gray-300 disabled:border-gray-200 disabled:cursor-not-allowed"
          title={autoArrange ? '自動整列 ON のとき常に整列済み' : '組織階層に従ってウィンドウを整列'}
        >⊞ 整列</button>
        <button
          onClick={() => setLineStyle(lineStyle === 'bezier' ? 'polyline' : 'bezier')}
          className={`px-2.5 py-1 text-[11px] font-medium rounded border shadow-sm transition-colors ${
            lineStyle === 'polyline'
              ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400'
          }`}
          title={lineStyle === 'bezier' ? 'ベジエ曲線（クリックで折れ線に切替）' : '折れ線（クリックでベジエに切替）'}
        >{lineStyle === 'bezier' ? '〜 曲線' : '⌐ 折れ線'}</button>

        {/* ── ズームコントロール ── */}
        <div ref={zoomDropdownRef} className="relative flex items-stretch border border-gray-300 rounded bg-white shadow-sm divide-x divide-gray-200">
          {/* 縮小ボタン（虫眼鏡−） */}
          <button
            onClick={() => stepCanvasZoom(-0.1)}
            disabled={canvasZoom <= 0.25}
            className="flex items-center justify-center w-7 h-[26px] text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-l transition-colors"
            title="縮小 (Ctrl+スクロール)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="5.8" cy="5.8" r="4" />
              <line x1="9" y1="9" x2="13" y2="13" />
              <line x1="3.5" y1="5.8" x2="8.1" y2="5.8" />
            </svg>
          </button>

          {/* ズームレベル表示（クリックでプリセット選択） */}
          <button
            onClick={() => setZoomDropdownOpen(v => !v)}
            className="flex items-center gap-0.5 px-1.5 h-[26px] text-[11px] text-gray-700 hover:bg-gray-50 tabular-nums min-w-[44px] justify-center transition-colors"
            title="ズームレベルを選択（クリック）"
          >
            {Math.round(canvasZoom * 100)}%
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-gray-400 mt-px flex-shrink-0">
              <path d="M1 2.5 L4 5.5 L7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* 拡大ボタン（虫眼鏡+） */}
          <button
            onClick={() => stepCanvasZoom(0.1)}
            disabled={canvasZoom >= 2.0}
            className="flex items-center justify-center w-7 h-[26px] text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-r transition-colors"
            title="拡大 (Ctrl+スクロール)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="5.8" cy="5.8" r="4" />
              <line x1="9" y1="9" x2="13" y2="13" />
              <line x1="3.5" y1="5.8" x2="8.1" y2="5.8" />
              <line x1="5.8" y1="3.5" x2="5.8" y2="8.1" />
            </svg>
          </button>

          {/* プリセットドロップダウン */}
          {zoomDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 min-w-[80px]">
              {[25, 50, 75, 100, 125, 150, 175, 200].map(pct => (
                <button
                  key={pct}
                  onClick={() => { setCanvasZoom(pct / 100); setZoomDropdownOpen(false) }}
                  className={`w-full text-left px-3 py-1 text-[12px] tabular-nums transition-colors hover:bg-gray-50 ${
                    Math.round(canvasZoom * 100) === pct ? 'font-semibold text-blue-600' : 'text-gray-700'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => { setCanvasZoom(1); setZoomDropdownOpen(false) }}
                  className="w-full text-left px-3 py-1 text-[12px] text-gray-500 hover:bg-gray-50 transition-colors"
                >リセット</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {band && (
        <div
          style={{
            position: 'fixed',
            left:   Math.min(band.x1, band.x2),
            top:    Math.min(band.y1, band.y2),
            width:  Math.abs(band.x2 - band.x1),
            height: Math.abs(band.y2 - band.y1),
            border: '1.5px solid #3b82f6',
            background: 'rgba(59,130,246,0.08)',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      )}

      <div
        ref={scrollerRef}
        className="h-full overflow-auto bg-[#e8ecf0]"
        style={{ cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={e => { if (e.ctrlKey || e.metaKey) e.preventDefault() }}
      >
        {/* ズームラッパー: スクロール可能領域をズーム後サイズに合わせる */}
        <div style={{ width: canvasWidth * canvasZoom, height: canvasHeight * canvasZoom, position: 'relative' }}>
          <div
            style={{
              width: canvasWidth, height: canvasHeight,
              position: 'absolute', top: 0, left: 0,
              transformOrigin: 'top left',
              transform: `scale(${canvasZoom})`,
            }}
          >

            {/* SVG 接続線レイヤー */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasWidth} height={canvasHeight}
              style={{ zIndex: 0 }}
            >
              {connections.map(({ parentPanel, childPanel }) => (
                <path
                  key={`${parentPanel.id}-${childPanel.id}`}
                  d={connectionPath(parentPanel, childPanel, panelHeights, lineStyle)}
                  fill="none"
                  stroke="#93a3b8"
                  strokeWidth="1.5"
                  strokeDasharray={lineStyle === 'polyline' ? undefined : '5 3'}
                />
              ))}
            </svg>

            {displayPanels.map(panel => (
              <div
                key={panel.id}
                className="absolute"
                style={{ left: panel.x, top: panel.y, width: WINDOW_W, zIndex: 1 }}
              >
                <TreeWindow panel={panel} isSelected={selectedOrgId === panel.orgId} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
