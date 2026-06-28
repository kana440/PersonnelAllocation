import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import type { PanelDef, ChildrenMode } from '../../../store/canvasLayoutStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useBeforeOrgView } from './BeforeOrgViewContext'
import { getDescendantOrgIds, hasAnyRows, subtreeRowCount } from '../panel/helpers'
import { ToggleTrack } from '../components/ToggleTrack'
import { BeforeTreeNode } from './BeforeTreeNode'
import { useStore } from '../../../store/useStore'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'

export function BeforeTreeWindow({ panel }: { panel: PanelDef }) {
  const { beforeOrganizations, beforeRowsByOrgId } = useBeforeOrgView()
  const { masters } = useStore()

  const {
    setComparisonPosition, toggleComparisonPanelOpen,
    setComparisonChildrenMode, setComparisonOrgOpen,
    setComparisonCollapsedOrgIds, setPanelHeight,
    comparisonPanels, canvasZoom,
    panelViewMode,
  } = useCanvasLayoutStore()

  const hasRowsFn  = useCallback((id: string) => beforeRowsByOrgId.has(id), [beforeRowsByOrgId])
  const getCountFn = useCallback((id: string) => beforeRowsByOrgId.get(id)?.length ?? 0, [beforeRowsByOrgId])

  const totalCount = subtreeRowCount(panel.orgId, beforeOrganizations, getCountFn)
  const headerBg   = '#5c5248'

  // ── ResizeObserver でパネル実測高さをストアへ通知 ────────────────
  const panelDivRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = panelDivRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { setPanelHeight(panel.id, el.offsetHeight) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [panel.id, setPanelHeight])

  // ── ウィンドウ移動（マウスドラッグ）────────────────────────────
  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const zoomRef    = useRef(canvasZoom)
  zoomRef.current  = canvasZoom

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
      setComparisonPosition(panel.id, Math.max(0, px + (e.clientX - mx) / z), Math.max(0, py + (e.clientY - my) / z))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panel.id, setComparisonPosition])

  // ── ブレッドクラム ─────────────────────────────────────────────
  const [rootPath, setRootPath] = useState([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = beforeOrganizations.find(o => o.id === currentRootId)
  const hasChildren   = beforeOrganizations.some(
    o => o.parentId === currentRootId && hasAnyRows(o.id, beforeOrganizations, hasRowsFn),
  )
  const childrenMode  = panel.childrenMode ?? 'windowed'
  const isContained   = childrenMode === 'inline'

  // ── コントロールハンドラ ──────────────────────────────────────
  const desc = useCallback(
    (id: string, directOnly?: boolean) => getDescendantOrgIds(id, beforeOrganizations, hasRowsFn, directOnly),
    [beforeOrganizations, hasRowsFn],
  )

  const handleCollapseAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (childrenMode === 'windowed') {
      ids.forEach(id => setComparisonOrgOpen(id, false))
    } else {
      setComparisonCollapsedOrgIds(panel.id, ids)
    }
  }, [currentRootId, desc, childrenMode, panel.id, setComparisonOrgOpen, setComparisonCollapsedOrgIds])

  const handleExpandChildren = useCallback(() => {
    const directChildIds = desc(currentRootId, true)
    const allIds         = desc(currentRootId)
    if (childrenMode === 'windowed') {
      allIds.forEach(id => setComparisonOrgOpen(id, false))
      directChildIds.forEach(id => setComparisonOrgOpen(id, true))
    } else {
      const direct = new Set(directChildIds)
      setComparisonCollapsedOrgIds(panel.id, allIds.filter(id => !direct.has(id)))
    }
  }, [currentRootId, desc, childrenMode, panel.id, setComparisonOrgOpen, setComparisonCollapsedOrgIds])

  const handleExpandAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (childrenMode === 'windowed') {
      ids.forEach(id => setComparisonOrgOpen(id, true))
    } else {
      setComparisonCollapsedOrgIds(panel.id, [])
    }
  }, [currentRootId, desc, childrenMode, panel.id, setComparisonOrgOpen, setComparisonCollapsedOrgIds])

  const handleToggleIndividualMode = useCallback(() => {
    const next: ChildrenMode = isContained ? 'windowed' : 'inline'
    setComparisonChildrenMode(panel.id, next)
    if (!isContained) {
      // inline に切り替え: windowed の子パネルを閉じる
      const ids = desc(currentRootId, true)
      ids.forEach(id => {
        const child = comparisonPanels.find(p => p.orgId === id)
        if (child) setComparisonOrgOpen(id, false)
      })
    }
  }, [isContained, panel.id, currentRootId, desc, comparisonPanels, setComparisonChildrenMode, setComparisonOrgOpen])

  return (
    <div
      ref={panelDivRef}
      data-before-window="true"
      data-panelid={panel.id}
      className="flex flex-col rounded shadow-lg border border-gray-400 select-none overflow-hidden"
      style={{ background: '#ffffff', width: panelViewMode === 'band' ? 208 : 288 }}
    >
      {/* ── タイトルバー ──────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
        style={{ background: headerBg, userSelect: 'none' }}
      >
        {/* メインタイトル行 */}
        <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
          <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
            {rootPath.length > 1 ? (
              rootPath.map((id, i) => {
                const o      = beforeOrganizations.find(o => o.id === id)
                const isLast = i === rootPath.length - 1
                return (
                  <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                    {i > 0 && <span className="text-stone-400 text-[9px]">/</span>}
                    <button
                      onClick={() => setRootPath(prev => prev.slice(0, i + 1))}
                      className={`text-[10px] max-w-[5rem] truncate ${
                        isLast ? 'font-semibold text-white cursor-default' : 'text-stone-300 hover:text-white'
                      }`}
                    >{o?.name ?? id}</button>
                  </span>
                )
              })
            ) : (
              <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? currentRootId}</span>
            )}
            <span className="text-[10px] text-stone-300 flex-shrink-0 ml-0.5">({totalCount})</span>
          </div>

          <div className="flex items-center flex-shrink-0">
            {rootPath.length > 1 && (
              <button
                onClick={() => setRootPath(prev => prev.slice(0, prev.length - 1))}
                className="w-5 h-5 flex items-center justify-center text-[10px] text-stone-300 hover:text-white hover:bg-stone-600 rounded"
                title="一つ上へ"
              >↑</button>
            )}
            <button
              onClick={() => toggleComparisonPanelOpen(panel.id)}
              title={panel.open ? '折りたたむ' : '展開'}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-stone-600 text-xs transition-colors"
            >{panel.open ? '─' : '▲'}</button>
          </div>
        </div>

      </div>

      {/* ── コントロールバー（after-canvas の TreeWindowControls と同構造）── */}
      {panel.open && hasChildren && (
        <div className="flex-shrink-0 flex items-stretch bg-gray-50 border-b border-gray-200" style={{ height: 24 }}>
          {([
            { label: 'たたむ', onClick: handleCollapseAll,    title: 'すべての子組織を折りたたむ' },
            { label: '子のみ', onClick: handleExpandChildren, title: '直接の子だけ展開（孫はたたむ）' },
            { label: '全展開', onClick: handleExpandAll,      title: 'すべての子組織を展開' },
          ] as const).map(({ label, onClick, title }) => (
            <button
              key={label}
              onClick={onClick}
              title={title}
              className="flex-1 text-[9px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-r border-gray-200 transition-colors"
            >{label}</button>
          ))}
          <div className="w-px bg-gray-200 flex-shrink-0" />
          <button
            role="switch"
            aria-checked={isContained}
            onClick={handleToggleIndividualMode}
            title={isContained
              ? '縦並モード: 子組織をこの中に縦並びで表示（クリックで個別に切り替え）'
              : '個別モード: 子組織を別ウィンドウで表示（クリックで縦並びに切り替え）'}
            className="flex items-center gap-1.5 px-2.5 flex-shrink-0 h-full hover:bg-gray-100 transition-colors"
          >
            <span className={`text-[9px] font-medium transition-colors ${isContained ? 'text-blue-600' : 'text-gray-400'}`}>
              縦並
            </span>
            <ToggleTrack on={isContained} />
          </button>
        </div>
      )}

      {/* ── ボディ ───────────────────────────────────────────────── */}
      {panel.open && (
        panelViewMode === 'band'
          ? <BeforeBandView orgId={currentRootId} beforeRowsByOrgId={beforeRowsByOrgId} masters={masters} />
          : <div className="overflow-y-auto p-1.5" style={{ maxHeight: 1600 }}>
              {currentOrg ? (
                <BeforeTreeNode
                  key={currentRootId}
                  orgId={currentRootId}
                  panelId={panel.id}
                  onNavigate={id => setRootPath(prev => [...prev, id])}
                  isRoot
                />
              ) : (
                <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
              )}
            </div>
      )}
    </div>
  )
}

interface BeforeBandViewProps {
  orgId:              string
  beforeRowsByOrgId:  Map<string, AllocationRow[]>
  masters:            AllMasters
}

function BeforeBandView({ orgId, beforeRowsByOrgId, masters }: BeforeBandViewProps) {
  const rows = beforeRowsByOrgId.get(orgId) ?? []

  const bandGroups = useMemo(() => {
    const groups = new Map<string, AllocationRow[]>()
    for (const row of rows) {
      if (!row.userId) continue
      const band = (row.positionBand as string | undefined) ?? '(未設定)'
      const arr  = groups.get(band)
      if (arr) arr.push(row)
      else groups.set(band, [row])
    }
    return [...groups.entries()]
      .sort(([bandA], [bandB]) => {
        const lvA = masters.jobLevels.find((e: { label: string; promotionDemotionWarningLevel: number }) => e.label === bandA)?.promotionDemotionWarningLevel ?? -1
        const lvB = masters.jobLevels.find((e: { label: string; promotionDemotionWarningLevel: number }) => e.label === bandB)?.promotionDemotionWarningLevel ?? -1
        return lvB - lvA
      })
      .map(([band, items]) => ({ band, items }))
  }, [rows, masters.jobLevels])

  if (bandGroups.length === 0) return <p className="text-[10px] text-gray-400 text-center py-3">メンバーなし</p>

  return (
    <div className="overflow-y-auto p-1.5 space-y-1.5" style={{ maxHeight: 1600 }}>
      {bandGroups.map(({ band, items }) => (
        <div key={band}>
          <div className="text-[9px] font-semibold text-gray-400 tracking-wider mb-0.5 px-0.5 leading-none">{band}</div>
          <div className="flex flex-wrap gap-1">
            {items.map(row => {
              const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || ''
              return (
                <div
                  key={row.rowId}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border-l-2 border-stone-400 bg-stone-50 text-stone-700 select-none"
                >
                  {name}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
