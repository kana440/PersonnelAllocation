import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { useScopedStore }       from '../../../store/useScopedStore'
import type { Person }          from '@personnel/domain/schemas'
import { BeforeTreeWindow }     from './BeforeTreeWindow'
import { BeforeOrgViewContext } from './BeforeOrgViewContext'
import type { BeforeOrgViewContextValue } from './BeforeOrgViewContext'
import {
  EST_WIN_H, CANVAS_MARGIN,
  isStandaloneWindow, computeLayout, connectionPath, buildConnections,
  buildPanelByOrgIdMap, buildOrgByIdMap,
} from '../treeWindowLayout'
import { VIEW_MODE_WIDTHS } from '../../../store/canvasLayoutStore'

export function BeforeTreeWindowCanvas() {
  const beforeOrganizations = useStore(s => s.beforeOrganizations)
  const afterOrganizations  = useStore(s => s.afterOrganizations)
  const persons             = useStore(s => s.persons) as Person[]
  const { allocationList }  = useScopedStore()

  const {
    comparisonPanels,
    comparisonOrgMapping,
    initComparisonPanels,
    setComparisonOrgOpen,
    panelHeights,
    lineStyle,
    canvasZoom, stepCanvasZoom,
    panelViewMode,
    panels: afterPanels,  // 右側（after）のパネル一覧
  } = useCanvasLayoutStore(useShallow(s => ({
    comparisonPanels:     s.comparisonPanels,
    comparisonOrgMapping: s.comparisonOrgMapping,
    initComparisonPanels: s.initComparisonPanels,
    setComparisonOrgOpen: s.setComparisonOrgOpen,
    panelHeights:         s.panelHeights,
    lineStyle:            s.lineStyle,
    canvasZoom:           s.canvasZoom,
    stepCanvasZoom:       s.stepCanvasZoom,
    panelViewMode:        s.panelViewMode,
    panels:               s.panels,
  })))
  const winW = VIEW_MODE_WIDTHS[panelViewMode]

  const beforeOrgByCode = useMemo(
    () => new Map(beforeOrganizations.map(o => [o.externalCode, o.id])),
    [beforeOrganizations],
  )
  // afterOrgId → beforeOrgId の逆引き Map
  const afterIdToBeforeId = useMemo(
    () => new Map(Object.entries(comparisonOrgMapping).map(([bId, aId]) => [aId, bId])),
    [comparisonOrgMapping],
  )
  // beforeOrg の O(1) ルックアップ
  const beforeOrgById = useMemo(() => buildOrgByIdMap(beforeOrganizations), [beforeOrganizations])

  // beforeOrg の子 ID リスト（subtree 判定用）
  const beforeChildrenIds = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const o of beforeOrganizations) {
      if (!o.parentId) continue
      const arr = m.get(o.parentId)
      if (arr) arr.push(o.id)
      else m.set(o.parentId, [o.id])
    }
    return m
  }, [beforeOrganizations])

  // 右側パネル (afterPanels) に対応する before-org の ID セットを計算（O(N)）
  const syncedOpenOrgIds = useMemo(() => {
    const result = new Set<string>()
    for (const p of afterPanels) {
      const afterOrg = afterOrganizations.find(o => o.id === p.orgId)
      if (!afterOrg) continue
      // 同じ externalCode の before-org を優先
      const beforeId = afterOrg.externalCode ? beforeOrgByCode.get(afterOrg.externalCode) : undefined
      if (beforeId) { result.add(beforeId); continue }
      // comparisonOrgMapping 逆引き
      const byMapping = afterIdToBeforeId.get(p.orgId)
      if (byMapping) result.add(byMapping)
    }
    return result
  }, [afterPanels, afterOrganizations, beforeOrgByCode, afterIdToBeforeId])

  // syncedOpenOrgIds とその祖先を含む展開済み ID セット
  // root 以外の org が synced されている場合、その祖先も open にしないと
  // isStandaloneWindow で standalone にならず表示されない
  const expandedOpenIds = useMemo(() => {
    const viewOrgs = beforeOrganizations.filter(o => !o.isAbandoned)
    const orgIdSet  = new Set(viewOrgs.map(o => o.id))
    const orgById   = new Map(viewOrgs.map(o => [o.id, o]))

    // 常にルート org を含める（synced がなければルートのみ）
    const roots = new Set(viewOrgs.filter(o => !o.parentId || !orgIdSet.has(o.parentId)).map(o => o.id))
    const result = new Set(roots)

    // synced org とその全祖先を追加
    for (const orgId of syncedOpenOrgIds) {
      result.add(orgId)
      let cur = orgById.get(orgId)?.parentId
      while (cur) {
        result.add(cur)
        cur = orgById.get(cur)?.parentId
      }
    }
    return result
  }, [beforeOrganizations, syncedOpenOrgIds])

  // 比較モード開始時にパネルを初期化
  // comparisonPanels.length を dep に含めることで clearPanels() 後も再初期化できる
  useEffect(() => {
    if (comparisonPanels.length > 0) return  // guard: 既に初期化済み
    const viewOrgs = beforeOrganizations.filter(o => !o.isAbandoned)
    const ids = viewOrgs.map(o => o.id)
    if (ids.length === 0) return
    initComparisonPanels(ids, expandedOpenIds)
  }, [beforeOrganizations, initComparisonPanels, comparisonPanels.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // 右側パネルが追加されたら対応する before-org パネルを自動展開（祖先も含めて open）
  useEffect(() => {
    if (comparisonPanels.length === 0) return  // 未初期化はスキップ
    for (const orgId of expandedOpenIds) {
      const p = comparisonPanels.find(cp => cp.orgId === orgId)
      if (p && !p.open) setComparisonOrgOpen(orgId, true)
    }
  }, [expandedOpenIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // orgId → その org に所属していた rows を O(N+3000) で構築
  const beforeRowsByOrgId = useMemo(() => {
    // externalCode → orgId の Map を先に構築
    const codeToOrgId = new Map(beforeOrganizations.map(o => [o.externalCode, o.id]))
    const map = new Map<string, typeof allocationList>()
    for (const row of allocationList) {
      if (!row.userId || !row.prevDepartmentCode) continue
      const orgId = codeToOrgId.get(row.prevDepartmentCode)
      if (!orgId) continue
      const arr = map.get(orgId)
      if (arr) arr.push(row)
      else map.set(orgId, [row])
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
  const standalonePanels = useMemo(() => {
    const panelByOrgId = buildPanelByOrgIdMap(comparisonPanels)
    return comparisonPanels.filter(p => isStandaloneWindow(p, panelByOrgId, beforeOrgById))
  }, [comparisonPanels, beforeOrgById])

  const displayPanels = useMemo(() => {
    if (standalonePanels.length === 0) return standalonePanels
    const posMap = computeLayout(standalonePanels, beforeOrgById, panelHeights, winW)
    return standalonePanels.map(p => {
      const pos = posMap.get(p.id)
      return pos ? { ...p, ...pos } : p
    })
  }, [standalonePanels, beforeOrgById, panelHeights, winW])

  const connections = useMemo(
    () => buildConnections(displayPanels, beforeOrgById),
    [displayPanels, beforeOrgById],
  )

  // キャンバスサイズ（実測高さを使用）
  const canvasWidth  = displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + winW + CANVAS_MARGIN * 2))
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
                    d={connectionPath(parentPanel, childPanel, panelHeights, lineStyle, winW)}
                    fill="none" stroke="#b8a89a" strokeWidth="1.5"
                    strokeDasharray={lineStyle === 'polyline' ? undefined : '5 3'}
                  />
                ))}
              </svg>

              {/* ウィンドウ群 */}
              {displayPanels.map(panel => {
                const hasSubtreeRows = (id: string): boolean =>
                  (beforeRowsByOrgId.get(id)?.length ?? 0) > 0 ||
                  (beforeChildrenIds.get(id) ?? []).some(hasSubtreeRows)
                if (!hasSubtreeRows(panel.orgId)) return null
                return (
                  <div
                    key={panel.id}
                    className="absolute"
                    style={{ left: panel.x, top: panel.y, width: winW, zIndex: 1 }}
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
