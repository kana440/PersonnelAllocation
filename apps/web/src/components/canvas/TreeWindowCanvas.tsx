import { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { useStore }             from '../../store/useStore'
import { useOrgView }           from './OrgViewContext'
import { TreeWindow }           from './after'
import { useCanvasScroll }      from './hooks/useCanvasScroll'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import {
  EST_WIN_H, CANVAS_MARGIN,
  isStandaloneWindow, computeLayout, connectionPath, buildConnections,
  buildPanelByOrgIdMap, buildOrgByIdMap,
} from './treeWindowLayout'
import { VIEW_MODE_WIDTHS } from '../../store/canvasLayoutStore'
import { FilterBar }           from './FilterBar'
import { applyCanvasFilters, buildSubtreeMap } from './FilterBar/filterLogic'
import { findSecondmentOrgCode } from '@personnel/domain/commands/helpers'

export function TreeWindowCanvas() {
  const {
    panels, setPositions,
    autoArrange, setAutoArrange,
    lineStyle, setLineStyle,
    panelHeights,
    triggerComparisonArrange,
    canvasZoom, setCanvasZoom, stepCanvasZoom,
    filterCards, globalFilters,
    panelViewMode,
  } = useCanvasLayoutStore()
  const winW = VIEW_MODE_WIDTHS[panelViewMode]
  const selectedOrgId       = useStore(s => s.selectedOrgId)
  const { masters }         = useStore()
  const { organizations, afterMembersByOrgId, positionTreeByOrgId } = useOrgView()

  // ── O(1) Map（organizations が変わるときのみ再構築）──────────────
  const orgById = useMemo(() => buildOrgByIdMap(organizations), [organizations])

  // ── フィルタ用計算 ─────────────────────────────────────────────
  const memberOrgIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [orgId, pos] of positionTreeByOrgId) {
      if (pos.length > 0) ids.add(orgId)
    }
    for (const [orgId, members] of afterMembersByOrgId) {
      if (members.length > 0) ids.add(orgId)
    }
    return ids
  }, [positionTreeByOrgId, afterMembersByOrgId])

  // org → 全子孫マップ（サブツリーフィルタ用）
  const subtreeMap = useMemo(() => buildSubtreeMap(organizations), [organizations])

  // 出向アンカーの強制表示セット
  const secondmentOrgIds = useMemo(() => {
    const ids = new Set<string>()
    for (const anchorId of globalFilters.secondmentAnchors) {
      ids.add(anchorId)
      const anchor = organizations.find(o => o.id === anchorId)
      if (!anchor?.externalCode) continue
      const code = findSecondmentOrgCode(anchor.externalCode, organizations, masters)
      if (code) {
        const sOrg = organizations.find(o => o.externalCode === code)
        if (sOrg) ids.add(sOrg.id)
      }
    }
    return ids
  }, [globalFilters.secondmentAnchors, organizations, masters])

  // Pass 1: 通常フィルタ（出向展開なし）
  const primaryFilteredPanels = useMemo(
    () => applyCanvasFilters({
      panels, filterCards, globalFilters,
      allOrgs: organizations, orgMasterEntries: masters.orgMasterEntries,
      memberOrgIds, secondmentOrgIds, subtreeMap,
    }),
    [panels, filterCards, globalFilters, organizations, masters.orgMasterEntries, memberOrgIds, secondmentOrgIds, subtreeMap],
  )

  // Pass 2: 「出向組織含む」が ON のとき、表示中の各組織の出向者用組織を追加
  const relatedSecondmentOrgIds = useMemo(() => {
    if (!globalFilters.includeRelatedSecondmentOrgs) return new Set<string>()
    const ids = new Set<string>()
    for (const panel of primaryFilteredPanels) {
      const org = organizations.find(o => o.id === panel.orgId)
      if (!org?.externalCode) continue
      const code = findSecondmentOrgCode(org.externalCode, organizations, masters)
      if (code) {
        const sOrg = organizations.find(o => o.externalCode === code)
        if (sOrg) ids.add(sOrg.id)
      }
    }
    return ids
  }, [primaryFilteredPanels, globalFilters.includeRelatedSecondmentOrgs, organizations, masters])

  const filteredPanels = useMemo(() => {
    if (!globalFilters.includeRelatedSecondmentOrgs || relatedSecondmentOrgIds.size === 0) {
      return primaryFilteredPanels
    }
    const extra = panels.filter(p =>
      relatedSecondmentOrgIds.has(p.orgId) &&
      !primaryFilteredPanels.some(pp => pp.orgId === p.orgId),
    )
    return [...primaryFilteredPanels, ...extra]
  }, [primaryFilteredPanels, relatedSecondmentOrgIds, panels, globalFilters.includeRelatedSecondmentOrgs])

  // ── スタンドアロンパネルと表示座標 ───────────────────────────────
  const standalonePanels = useMemo(() => {
    const panelByOrgId = buildPanelByOrgIdMap(filteredPanels)
    return filteredPanels.filter(p => isStandaloneWindow(p, panelByOrgId, orgById))
  }, [filteredPanels, orgById])

  const displayPanels = useMemo(() => {
    if (!autoArrange) return standalonePanels
    const posMap = computeLayout(standalonePanels, orgById, panelHeights, winW)
    return standalonePanels.map(p => {
      const pos = posMap.get(p.id)
      return pos ? { ...p, ...pos } : p
    })
  }, [autoArrange, standalonePanels, orgById, panelHeights, winW])

  const connections = useMemo(
    () => buildConnections(displayPanels, orgById),
    [displayPanels, orgById],
  )

  const canvasWidth  = displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + winW + CANVAS_MARGIN * 2))
  const canvasHeight = displayPanels.length === 0 ? 800
    : Math.max(800, ...displayPanels.map(p => p.y + (panelHeights[p.id] ?? EST_WIN_H) + CANVAS_MARGIN * 2))

  // ── 整列ボタン ──────────────────────────────────────────────────
  const handleArrange = useCallback(() => {
    setPositions(computeLayout(standalonePanels, orgById, panelHeights, winW))
    triggerComparisonArrange()
  }, [standalonePanels, orgById, panelHeights, winW, setPositions, triggerComparisonArrange])

  const handleAutoArrangeChange = useCallback((checked: boolean) => {
    if (!checked) setPositions(computeLayout(standalonePanels, orgById, panelHeights, winW))
    setAutoArrange(checked)
    if (checked) triggerComparisonArrange()
  }, [standalonePanels, orgById, panelHeights, winW, setPositions, setAutoArrange, triggerComparisonArrange])

  // ── スクロール（人物・組織）────────────────────────────────────
  const { scrollerRef }                              = useCanvasScroll(displayPanels, organizations)
  const { spaceHeld, panning, band, handleCanvasMouseDown } = useCanvasInteraction(scrollerRef)

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
      <FilterBar />

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
                {connections.map(({ parentPanel, childPanel }) => (
                  <path
                    key={`${parentPanel.id}-${childPanel.id}`}
                    d={connectionPath(parentPanel, childPanel, panelHeights, lineStyle, winW)}
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
}
