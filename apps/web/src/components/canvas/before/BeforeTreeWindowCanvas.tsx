import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { useScopedStore }       from '../../../store/useScopedStore'
import type { Person }          from '@personnel/domain/schemas'
import { BeforeTreeWindow }     from './BeforeTreeWindow'
import { BeforeOrgViewContext } from './BeforeOrgViewContext'
import { subtreeRowCount } from '../panel/helpers'
import type { BeforeOrgViewContextValue } from './BeforeOrgViewContext'
import {
  WINDOW_W, EST_WIN_H, CANVAS_MARGIN,
  isStandaloneWindow, computeLayout, connectionPath, buildConnections,
} from '../treeWindowLayout'

export function BeforeTreeWindowCanvas() {
  const { beforeOrganizations, afterOrganizations } = useStore()
  const { allocationList } = useScopedStore()
  const persons = useStore(s => s.persons) as Person[]

  const {
    comparisonPanels,
    comparisonOrgMapping,
    initComparisonPanels,
    setComparisonOrgOpen,
    panelHeights,
    lineStyle,
    canvasZoom, stepCanvasZoom,
  } = useCanvasLayoutStore()

  // 比較モード開始時にパネルを初期化（ルート org のみ open:true、他は closed chip として表示）
  // comparisonPanels.length を dep に含めることで clearPanels() 後も再初期化できる
  useEffect(() => {
    if (comparisonPanels.length > 0) return  // guard: 既に初期化済み
    const viewOrgs = beforeOrganizations.filter(o => !o.isAbandoned)
    const ids = viewOrgs.map(o => o.id)
    if (ids.length === 0) return
    const orgIdSet = new Set(ids)
    const rootOrgIds = new Set(
      viewOrgs.filter(o => !o.parentId || !orgIdSet.has(o.parentId)).map(o => o.id)
    )
    initComparisonPanels(ids, rootOrgIds)
  }, [beforeOrganizations, initComparisonPanels, comparisonPanels.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // orgId → その org に所属していた rows (prevDepartmentCode で紐付け)
  const beforeRowsByOrgId = useMemo(() => {
    const map = new Map<string, typeof allocationList>()
    for (const org of beforeOrganizations) {
      if (!org.externalCode) continue
      const rows = allocationList.filter(r => r.userId && r.prevDepartmentCode === org.externalCode)
      if (rows.length > 0) map.set(org.id, rows)
    }
    return map
  }, [beforeOrganizations, allocationList])

  // 選択状態（ローカル）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = useCallback((personId: string, ctrl: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (ctrl) {
        if (next.has(personId)) { next.delete(personId) } else { next.add(personId) }
      } else {
        return prev.has(personId) && prev.size === 1 ? new Set<string>() : new Set([personId])
      }
      return next
    })
  }, [])
  const clearSelect = useCallback(() => setSelectedIds(new Set()), [])

  // スタンドアロンパネル + 位置をリアクティブに計算（panelHeights が更新されると自動再計算）
  const standalonePanels = useMemo(
    () => comparisonPanels.filter(p => isStandaloneWindow(p, comparisonPanels, beforeOrganizations)),
    [comparisonPanels, beforeOrganizations],
  )

  const displayPanels = useMemo(() => {
    if (standalonePanels.length === 0) return standalonePanels
    const posMap = computeLayout(standalonePanels, comparisonPanels, beforeOrganizations, panelHeights)
    return standalonePanels.map(p => {
      const pos = posMap.get(p.id)
      return pos ? { ...p, ...pos } : p
    })
  }, [standalonePanels, comparisonPanels, beforeOrganizations, panelHeights])

  const connections = useMemo(
    () => buildConnections(displayPanels, beforeOrganizations),
    [displayPanels, beforeOrganizations],
  )

  // キャンバスサイズ（実測高さを使用）
  const canvasWidth  = displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + WINDOW_W + CANVAS_MARGIN * 2))
  const canvasHeight = displayPanels.length === 0 ? 800
    : Math.max(800, ...displayPanels.map(p => p.y + (panelHeights[p.id] ?? EST_WIN_H) + CANVAS_MARGIN * 2))

  // ── 選択中の行が変わったら before-canvas をスクロール ─────────────
  const selectedCardRowId    = useStore(s => s.selectedCardRowId)
  const selectedCardSource   = useStore(s => s.selectedCardSource)
  const scrollToBeforeRowRequest = useCanvasLayoutStore(s => s.scrollToBeforeRowRequest)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // after-canvas からの選択時: before-canvas のパネルチェーンを展開してスクロール
  useEffect(() => {
    if (!selectedCardRowId || selectedCardSource !== 'after') return

    // 対象 row の prevDepartmentCode からパネルチェーンを展開（祖先→ターゲット）
    const row = allocationList.find(r => r.rowId === selectedCardRowId)
    if (row?.prevDepartmentCode) {
      const viewOrgs = beforeOrganizations.filter(o => !o.isAbandoned)
      const targetOrg = viewOrgs.find(o => o.externalCode === row.prevDepartmentCode)
      if (targetOrg) {
        const orgMap = new Map(viewOrgs.map(o => [o.id, o]))
        const curPanels = useCanvasLayoutStore.getState().comparisonPanels
        const panelMap = new Map(curPanels.map(p => [p.orgId, p]))
        const chain: string[] = []
        let cur = orgMap.get(targetOrg.id)
        while (cur) {
          chain.unshift(cur.id)
          cur = cur.parentId ? orgMap.get(cur.parentId) : undefined
        }
        for (const id of chain) {
          const panel = panelMap.get(id)
          if (panel && !panel.open) setComparisonOrgOpen(id, true)
        }
      }
    }

    // パネル展開後（次フレーム）にスクロール
    const rowId = selectedCardRowId
    setTimeout(() => {
      scrollerRef.current
        ?.querySelector<HTMLElement>(`[data-before-rowid="${rowId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }, 0)
  }, [selectedCardRowId, selectedCardSource]) // eslint-disable-line react-hooks/exhaustive-deps

  // サイドバーからの選択時: パネル展開後にスクロール（seq で重複排除）
  useEffect(() => {
    if (!scrollToBeforeRowRequest || !scrollerRef.current) return
    const el = scrollerRef.current.querySelector<HTMLElement>(`[data-before-rowid="${scrollToBeforeRowRequest.rowId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [scrollToBeforeRowRequest])

  // ── Ctrl+Wheel ズーム（TreeWindowCanvas と共有） ─────────────────
  // standalonePanels.length > 0 を dep に含めることで、比較モード開始後に
  // スクローラーが現れたタイミングで effect を再実行し、リスナーを正しく登録する
  const hasBeforeContent = standalonePanels.length > 0
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
  }, [hasBeforeContent, stepCanvasZoom])

  // ── Space キー保持状態 ────────────────────────────────────────────
  const [spaceHeld, setSpaceHeld] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.type === 'keydown') { e.preventDefault(); setSpaceHeld(true) }
      else { setSpaceHeld(false) }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup',   onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup',   onKey)
    }
  }, [])

  // ── Space+drag パン ───────────────────────────────────────────────
  const [panning, setPanning]  = useState(false)
  const panningRef = useRef(false)
  const panOrigin  = useRef({ mx: 0, my: 0, sl: 0, st: 0 })

  useEffect(() => {
    if (!panning) return
    const onMove = (e: MouseEvent) => {
      if (!scrollerRef.current) return
      scrollerRef.current.scrollLeft = panOrigin.current.sl - (e.clientX - panOrigin.current.mx)
      scrollerRef.current.scrollTop  = panOrigin.current.st - (e.clientY - panOrigin.current.my)
    }
    const onUp = () => { panningRef.current = false; setPanning(false) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panning])

  // ── ラバーバンド選択 ──────────────────────────────────────────────
  type BandRect = { x1: number; y1: number; x2: number; y2: number }
  const [band,    setBand]    = useState<BandRect | null>(null)
  const bandRef               = useRef<BandRect | null>(null)
  const isCtrlBand            = useRef(false)

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-before-window]')) return
    e.preventDefault()
    if (spaceHeld) {
      panningRef.current = true
      setPanning(true)
      panOrigin.current = {
        mx: e.clientX, my: e.clientY,
        sl: scrollerRef.current?.scrollLeft ?? 0,
        st: scrollerRef.current?.scrollTop  ?? 0,
      }
      return
    }
    isCtrlBand.current = e.ctrlKey || e.metaKey
    const r = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY }
    bandRef.current = r
    setBand(r)
  }, [spaceHeld])

  useEffect(() => {
    if (!band) return
    const onMove = (e: MouseEvent) => {
      const r = { ...bandRef.current!, x2: e.clientX, y2: e.clientY }
      bandRef.current = r
      setBand(r)
    }
    const onUp = () => {
      const rb = bandRef.current
      if (rb) {
        const left = Math.min(rb.x1, rb.x2), right  = Math.max(rb.x1, rb.x2)
        const top  = Math.min(rb.y1, rb.y2), bottom = Math.max(rb.y1, rb.y2)
        if (right - left > 4 || bottom - top > 4) {
          const ids: string[] = []
          document.querySelectorAll<HTMLElement>('[data-before-personid]:not([data-before-personid=""])').forEach(el => {
            const r = el.getBoundingClientRect()
            if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
              const pid = el.getAttribute('data-before-personid')
              if (pid) ids.push(pid)
            }
          })
          if (ids.length > 0) {
            if (!isCtrlBand.current) setSelectedIds(new Set(ids))
            else setSelectedIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })
          } else if (!isCtrlBand.current) {
            clearSelect()
          }
        } else if (!isCtrlBand.current) {
          clearSelect()
        }
      }
      bandRef.current = null
      setBand(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [band !== null, clearSelect])  // eslint-disable-line react-hooks/exhaustive-deps

  const ctxValue: BeforeOrgViewContextValue = {
    beforeOrganizations,
    beforeRowsByOrgId,
    afterOrganizations,
    comparisonOrgMapping,
    persons,
    selectedIds,
    toggleSelect,
    clearSelect,
  }

  if (standalonePanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        旧組織が読み込まれると表示されます
      </div>
    )
  }

  return (
    <BeforeOrgViewContext.Provider value={ctxValue}>
      <div className="relative h-full">
        {/* 選択件数オーバーレイ */}
        {selectedIds.size > 0 && (
          <div className="absolute top-2 right-3 z-10">
            <span className="text-[11px] text-stone-500 bg-white/80 px-2 py-0.5 rounded border border-stone-200">
              {selectedIds.size}名選択中
            </span>
          </div>
        )}

        {/* ラバーバンド */}
        {band && (
          <div
            style={{
              position: 'fixed',
              left:   Math.min(band.x1, band.x2),
              top:    Math.min(band.y1, band.y2),
              width:  Math.abs(band.x2 - band.x1),
              height: Math.abs(band.y2 - band.y1),
              border: '1.5px solid #92400e',
              background: 'rgba(146,64,14,0.06)',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          />
        )}

        <div
          ref={scrollerRef}
          className="h-full overflow-auto bg-[#ece7e2]"
          style={{ cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
          onMouseDown={handleCanvasMouseDown}
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
              {/* SVG 接続線（after-canvas と同じ connectionPath を使用） */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={canvasWidth} height={canvasHeight}
                style={{ zIndex: 0 }}
              >
                {connections.map(({ parentPanel, childPanel }) => (
                  <path
                    key={`${parentPanel.id}-${childPanel.id}`}
                    d={connectionPath(parentPanel, childPanel, panelHeights, lineStyle)}
                    fill="none" stroke="#b8a89a" strokeWidth="1.5"
                    strokeDasharray={lineStyle === 'polyline' ? undefined : '5 3'}
                  />
                ))}
              </svg>

              {/* ウィンドウ群 */}
              {displayPanels.map(panel => {
                const count = subtreeRowCount(panel.orgId, beforeOrganizations, id => beforeRowsByOrgId.get(id)?.length ?? 0)
                if (count === 0) return null
                return (
                  <div
                    key={panel.id}
                    className="absolute"
                    style={{ left: panel.x, top: panel.y, width: WINDOW_W, zIndex: 1 }}
                  >
                    <BeforeTreeWindow panel={panel} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </BeforeOrgViewContext.Provider>
  )
}
