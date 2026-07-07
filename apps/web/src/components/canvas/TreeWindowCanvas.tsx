import { useMemo, useCallback, useEffect, useState, useRef, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore, VIEW_MODE_WIDTHS } from '../../store/canvasLayoutStore'
import { useStore }             from '../../store/useStore'
import { useCanvasDisplayStore } from '../../store/canvasDisplayStore'
import { useOrgView }           from './OrgViewContext'
import { TreeWindow }           from './after'
import { useCanvasScroll }      from './hooks/useCanvasScroll'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import { usePanelVirtualization } from './hooks/usePanelVirtualization'
import {
  CANVAS_MARGIN,
  isStandaloneWindow, computeLayout, connectionPath, buildConnections,
  buildPanelByOrgIdMap, buildOrgByIdMap,
} from './treeWindowLayout'
import { COMPACT_GROUP_DEFS, DEFAULT_COMPACT_GROUP_ID } from './panel/compactGroupDefs'
import { estimateTreeBodyHeight, estimateBandBodyHeight, EST_HEADER_H } from './panel/heightEstimate'

// memo: OrgOperationView が selectedCardRowId 等の変化で再レンダーしても、
// context が変わらない限りここは再レンダーしない（props なし）
export const TreeWindowCanvas = memo(function TreeWindowCanvas() {
  // scrollToRowRequest / scrollToOrgId は useCanvasScroll が命令型で扱うため除外
  // → それらが変化してもここは再レンダーされない
  const {
    panels, setPositions,
    autoArrange, setAutoArrange,
    lineStyle, setLineStyle,
    panelHeights,
    triggerComparisonArrange,
    canvasZoom, setCanvasZoom, stepCanvasZoom,
    canvasPanelStyle,
    draggingPanelId,
  } = useCanvasLayoutStore(useShallow(s => ({
    panels:                  s.panels,
    setPositions:            s.setPositions,
    autoArrange:             s.autoArrange,
    setAutoArrange:          s.setAutoArrange,
    lineStyle:               s.lineStyle,
    setLineStyle:            s.setLineStyle,
    panelHeights:            s.panelHeights,
    triggerComparisonArrange: s.triggerComparisonArrange,
    canvasZoom:              s.canvasZoom,
    setCanvasZoom:           s.setCanvasZoom,
    stepCanvasZoom:          s.stepCanvasZoom,
    canvasPanelStyle:           s.canvasPanelStyle,
    draggingPanelId:         s.draggingPanelId,
  })))
  const winW = VIEW_MODE_WIDTHS[canvasPanelStyle]
  const selectedOrgId = useStore(s => s.selectedOrgId)
  const compactGroupById = useCanvasDisplayStore(s => s.compactGroupById)
  const { organizations, positionTreeByOrgId } = useOrgView()

  const groupDef = useMemo(() =>
    COMPACT_GROUP_DEFS.find(d => d.id === compactGroupById)
      ?? COMPACT_GROUP_DEFS.find(d => d.id === DEFAULT_COMPACT_GROUP_ID)!,
    [compactGroupById])

  // rowId → orgId。マウント時に選択行の祖先パネルを開くために使う（useCanvasScroll 参照）
  const rowIdToOrgId = useMemo(() => {
    const map = new Map<number, string>()
    for (const [orgId, entries] of positionTreeByOrgId) {
      for (const e of entries) map.set(e.row.rowId, orgId)
    }
    return map
  }, [positionTreeByOrgId])

  // [perf] render開始 → commit(DOM反映)までの実測。React reconciliation + DOM mount コストを含む
  const renderStartRef = useRef(performance.now())
  renderStartRef.current = performance.now()

  // ── O(1) Map（organizations が変わるときのみ再構築）──────────────
  const orgById = useMemo(() => buildOrgByIdMap(organizations), [organizations])

  // ── スタンドアロンパネルと表示座標 ───────────────────────────────
  const standalonePanels = useMemo(() => {
    const panelByOrgId = buildPanelByOrgIdMap(panels)
    return panels.filter(p => isStandaloneWindow(p, panelByOrgId, orgById))
  }, [panels, orgById])

  // ── 未実測パネルの高さ見積もり（表示モード・グループ単位で変わる）────
  // 仮想化で一度も画面に出ていないパネルは実測（panelHeights）が永遠に届かないため、
  // 固定値の代わりに行数（ツリー）・グループ人数（コンパクト）から見積もる。
  // canvasPanelStyle・groupDef が変われば見積もりも変わるので依存に含める。
  const estimatedHeights = useMemo(() => {
    const bodyWidth = winW - 16
    const map: Record<string, number> = {}
    for (const p of standalonePanels) {
      const entries = positionTreeByOrgId.get(p.orgId) ?? []
      const bodyH = canvasPanelStyle === 'band'
        ? estimateBandBodyHeight(entries.map(e => groupDef.getKey(e.row)), bodyWidth)
        : estimateTreeBodyHeight(entries.length)
      map[p.id] = EST_HEADER_H + bodyH
    }
    return map
  }, [standalonePanels, positionTreeByOrgId, canvasPanelStyle, groupDef, winW])

  // 実測（panelHeights）があればそちらを優先し、無ければ見積もりを使う
  const effectiveHeights = useMemo(
    () => ({ ...estimatedHeights, ...panelHeights }),
    [estimatedHeights, panelHeights],
  )

  // ドラッグ中に mousemove のたびに全パネル分の computeLayout を再実行すると
  // 大規模データで致命的に重くなるため、ドラッグ中は前回の計算結果を使い回し、
  // ドラッグ対象パネルだけ実際の座標（ライブの x/y）に差し替える。
  // ドラッグ終了後（draggingPanelId が null に戻ったとき）に改めて全体を再計算する。
  const layoutCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const displayPanels = useMemo(() => {
    if (!autoArrange) return standalonePanels

    if (draggingPanelId) {
      return standalonePanels.map(p => {
        if (p.id === draggingPanelId) return p
        const cached = layoutCacheRef.current.get(p.id)
        return cached ? { ...p, ...cached } : p
      })
    }

    const perfLabel = `[perf] computeLayout (${standalonePanels.length} standalone panels / ${panels.length} total panels)`
    // eslint-disable-next-line no-console
    console.time(perfLabel)
    const posMap = computeLayout(standalonePanels, orgById, effectiveHeights, winW)
    // eslint-disable-next-line no-console
    console.timeEnd(perfLabel)
    layoutCacheRef.current = posMap
    return standalonePanels.map(p => {
      const pos = posMap.get(p.id)
      return pos ? { ...p, ...pos } : p
    })
  }, [autoArrange, standalonePanels, orgById, effectiveHeights, winW, panels.length, draggingPanelId])

  const connections = useMemo(
    () => buildConnections(displayPanels, orgById),
    [displayPanels, orgById],
  )

  const canvasWidth = useMemo(() =>
    displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + winW + CANVAS_MARGIN * 2))
  , [displayPanels, winW])

  const canvasHeight = useMemo(() =>
    displayPanels.length === 0 ? 800
    : Math.max(800, ...displayPanels.map(p => p.y + (effectiveHeights[p.id] ?? EST_HEADER_H) + CANVAS_MARGIN * 2))
  , [displayPanels, effectiveHeights])

  const connectionPaths = useMemo(() =>
    connections.map(({ parentPanel, childPanel }) => ({
      key: `${parentPanel.id}-${childPanel.id}`,
      d: connectionPath(parentPanel, childPanel, effectiveHeights, lineStyle, winW),
      dashArray: lineStyle === 'polyline' ? undefined : '5 3',
    }))
  , [connections, effectiveHeights, lineStyle, winW])

  // ── 整列ボタン ──────────────────────────────────────────────────
  const handleArrange = useCallback(() => {
    setPositions(computeLayout(standalonePanels, orgById, effectiveHeights, winW))
    triggerComparisonArrange()
  }, [standalonePanels, orgById, effectiveHeights, winW, setPositions, triggerComparisonArrange])

  const handleAutoArrangeChange = useCallback((checked: boolean) => {
    if (!checked) setPositions(computeLayout(standalonePanels, orgById, effectiveHeights, winW))
    setAutoArrange(checked)
    if (checked) triggerComparisonArrange()
  }, [standalonePanels, orgById, effectiveHeights, winW, setPositions, setAutoArrange, triggerComparisonArrange])

  // ── スクロール（人物・組織）────────────────────────────────────
  // useCanvasScroll → usePanelVirtualization の順で呼ぶこと
  // （スクロール位置の復元/ジャンプが先に確定してから可視パネルを計算するため）
  const { scrollerRef }                              = useCanvasScroll(displayPanels, organizations, orgById, rowIdToOrgId)
  const { spaceHeld, panning, band, handleCanvasMouseDown } = useCanvasInteraction(scrollerRef)

  // ── パネル単位の仮想化（画面外パネルは描画しない）────────────────
  const visiblePanelIds = usePanelVirtualization(scrollerRef, displayPanels, winW, effectiveHeights, canvasZoom)

  // ── Ctrl+Wheel ズーム ─────────────────────────────────────────
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

  // [perf] このレンダーが実際に DOM へ commit されるまでの所要時間
  // 注: displayPanels.length は「開いている」総数。実際に描画されたのは visiblePanelIds.size
  useEffect(() => {
    const elapsed = performance.now() - renderStartRef.current
    // eslint-disable-next-line no-console
    console.log(`[perf] TreeWindowCanvas render→commit: ${elapsed.toFixed(1)}ms (${visiblePanelIds.size} panels rendered / ${displayPanels.length} open / ${panels.length} total)`)
  })

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

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
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

      {displayPanels.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          {panels.length === 0
            ? 'Excel を読み込むと組織が表示されます'
            : 'フィルタ条件に一致する組織がありません'}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="h-full overflow-auto bg-[#e8ecf0]"
          style={{ cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
          onMouseDown={handleCanvasMouseDown}
          onContextMenu={e => { if (e.ctrlKey || e.metaKey) e.preventDefault() }}
        >
          <div style={{ width: canvasWidth * canvasZoom, height: canvasHeight * canvasZoom, position: 'relative' }}>
            <div
              style={{
                width: canvasWidth, height: canvasHeight,
                position: 'absolute', top: 0, left: 0,
                transformOrigin: 'top left',
                transform: `scale(${canvasZoom})`,
              }}
            >
              <svg
                className="absolute inset-0 pointer-events-none"
                width={canvasWidth} height={canvasHeight}
                style={{ zIndex: 0 }}
              >
                {connectionPaths.map(({ key, d, dashArray }) => (
                  <path
                    key={key}
                    d={d}
                    fill="none"
                    stroke="#93a3b8"
                    strokeWidth="1.5"
                    strokeDasharray={dashArray}
                  />
                ))}
              </svg>

              {displayPanels.filter(p => visiblePanelIds.has(p.id)).map(panel => (
                <div
                  key={panel.id}
                  className="absolute"
                  style={{ left: panel.x, top: panel.y, width: winW, zIndex: 1 }}
                >
                  <TreeWindow panel={panel} isSelected={selectedOrgId === panel.orgId} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
})
