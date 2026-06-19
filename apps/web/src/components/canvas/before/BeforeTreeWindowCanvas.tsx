import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore } from '../../../store/useStore'
import { useScopedStore } from '../../../store/useScopedStore'
import type { Organization, Person } from '@personnel/domain/schemas'
import { BeforeTreeWindow } from './BeforeTreeWindow'
import { BeforeOrgViewContext, beforeSubtreeRowCount } from './BeforeOrgViewContext'
import type { BeforeOrgViewContextValue } from './BeforeOrgViewContext'

const WINDOW_W  = 288
const TITLE_H   = 44    // 28px タイトル + 16px マッピングバッジ
const EST_WIN_H = 300
const H_GAP     = 16
const V_GAP     = 20
const MARGIN    = 40

// ── スタンドアロン判定（comparisonPanels + beforeOrgs） ────────────
function isBeforeStandalone(
  panel: PanelDef, allPanels: PanelDef[], beforeOrgs: Organization[],
): boolean {
  const org = beforeOrgs.find(o => o.id === panel.orgId)
  if (!org?.parentId) return true
  const parentPanel = allPanels.find(p => p.orgId === org.parentId)
  if (!parentPanel) return true
  return parentPanel.childrenMode === 'windowed'
    && panel.open
    && isBeforeStandalone(parentPanel, allPanels, beforeOrgs)
}

// ── レイアウト計算 ────────────────────────────────────────────────
function computeBeforeLayout(
  standalone: PanelDef[], allPanels: PanelDef[], beforeOrgs: Organization[],
): Map<string, { x: number; y: number }> {
  const getParent = (p: PanelDef) => {
    const org = beforeOrgs.find(o => o.id === p.orgId)
    return org?.parentId ? standalone.find(pp => pp.orgId === org.parentId) : undefined
  }
  const getChildren = (p: PanelDef) =>
    standalone.filter(c => {
      if (c.id === p.id) return false
      return beforeOrgs.find(o => o.id === c.orgId)?.parentId === p.orgId
    })

  const subtreeW = (p: PanelDef): number => {
    const ch = getChildren(p)
    if (ch.length === 0) return WINDOW_W
    return Math.max(WINDOW_W, ch.reduce((s, c, i) => s + subtreeW(c) + (i ? H_GAP : 0), 0))
  }

  const posMap  = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()
  const layout  = (p: PanelDef, x: number, y: number) => {
    if (visited.has(p.id)) return
    visited.add(p.id)
    const sw = subtreeW(p)
    posMap.set(p.id, { x: Math.round(x + Math.max(0, (sw - WINDOW_W) / 2)), y })
    let cx = x
    for (const child of getChildren(p)) {
      layout(child, cx, y + EST_WIN_H + V_GAP)
      cx += subtreeW(child) + H_GAP
    }
  }

  const roots = standalone.filter(p => !getParent(p))
  let rootX = MARGIN
  for (const root of roots) {
    layout(root, rootX, MARGIN)
    rootX += subtreeW(root) + H_GAP
  }

  void allPanels
  return posMap
}

// ── 接続線 ────────────────────────────────────────────────────────
function buildBeforeConnections(standalone: PanelDef[], beforeOrgs: Organization[]) {
  const result: { parentPanel: PanelDef; childPanel: PanelDef }[] = []
  for (const child of standalone) {
    const org    = beforeOrgs.find(o => o.id === child.orgId)
    const parent = org?.parentId ? standalone.find(p => p.orgId === org.parentId) : undefined
    if (parent) result.push({ parentPanel: parent, childPanel: child })
  }
  return result
}

// ── コンポーネント ────────────────────────────────────────────────
export function BeforeTreeWindowCanvas() {
  const { beforeOrganizations, afterOrganizations } = useStore()
  const { allocationList } = useScopedStore()
  const persons = useStore(s => s.persons) as Person[]

  const {
    comparisonPanels, setComparisonPositions,
    comparisonArrangeVersion, comparisonOrgMapping,
    initComparisonPanels,
  } = useCanvasLayoutStore()

  // 比較モード開始時にパネルを初期化
  useEffect(() => {
    const ids = beforeOrganizations.filter(o => !o.isAbandoned).map(o => o.id)
    if (ids.length > 0) initComparisonPanels(ids)
  }, [beforeOrganizations, initComparisonPanels])

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
  const toggleSelect = useCallback((userId: string, ctrl: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (ctrl) {
        if (next.has(userId)) { next.delete(userId) } else { next.add(userId) }
      } else {
        return prev.has(userId) && prev.size === 1 ? new Set<string>() : new Set([userId])
      }
      return next
    })
  }, [])
  const clearSelect = useCallback(() => setSelectedIds(new Set()), [])

  // スタンドアロンパネル
  const standalonePanels = useMemo(
    () => comparisonPanels.filter(p => isBeforeStandalone(p, comparisonPanels, beforeOrganizations)),
    [comparisonPanels, beforeOrganizations],
  )

  const connections = useMemo(
    () => buildBeforeConnections(standalonePanels, beforeOrganizations),
    [standalonePanels, beforeOrganizations],
  )

  // キャンバスサイズ
  const canvasWidth  = standalonePanels.length === 0 ? 1200
    : Math.max(1200, ...standalonePanels.map(p => p.x + WINDOW_W + MARGIN * 2))
  const canvasHeight = standalonePanels.length === 0 ? 800
    : Math.max(800, ...standalonePanels.map(p => p.y + EST_WIN_H + MARGIN * 2))

  // 自動整列
  const standalonePanelsRef = useRef(standalonePanels)
  standalonePanelsRef.current = standalonePanels
  const cPanelsRef = useRef(comparisonPanels)
  cPanelsRef.current = comparisonPanels
  const beforeOrgsRef = useRef(beforeOrganizations)
  beforeOrgsRef.current = beforeOrganizations

  useEffect(() => {
    if (comparisonArrangeVersion === 0) return
    const posMap = computeBeforeLayout(
      standalonePanelsRef.current, cPanelsRef.current, beforeOrgsRef.current,
    )
    setComparisonPositions(posMap)
  }, [comparisonArrangeVersion, setComparisonPositions])

  const handleArrange = useCallback(() => {
    const posMap = computeBeforeLayout(standalonePanels, comparisonPanels, beforeOrganizations)
    setComparisonPositions(posMap)
  }, [standalonePanels, comparisonPanels, beforeOrganizations, setComparisonPositions])

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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [panning, setPanning]  = useState(false)
  const panningRef = useRef(false)
  const panOrigin  = useRef({ mx: 0, my: 0, sl: 0, st: 0 })

  useEffect(() => {
    if (!panning) return
    const onMove = (e: MouseEvent) => {
      if (!scrollerRef.current) return
      const dx = e.clientX - panOrigin.current.mx
      const dy = e.clientY - panOrigin.current.my
      scrollerRef.current.scrollLeft = panOrigin.current.sl - dx
      scrollerRef.current.scrollTop  = panOrigin.current.st - dy
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
      // Space+drag: キャンバスをパン
      panningRef.current = true
      setPanning(true)
      panOrigin.current = {
        mx: e.clientX,
        my: e.clientY,
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
        {/* 整列ボタン */}
        <div className="absolute top-2 right-3 z-10 flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-[11px] text-stone-500 bg-white/80 px-2 py-0.5 rounded border border-stone-200">
              {selectedIds.size}名選択中
            </span>
          )}
          <button
            onClick={handleArrange}
            className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
            title="組織階層に従ってウィンドウを整列"
          >⊞ 整列</button>
        </div>

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
          <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
            {/* SVG 接続線 */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasWidth} height={canvasHeight}
              style={{ zIndex: 0 }}
            >
              {connections.map(({ parentPanel, childPanel }) => {
                const sx  = parentPanel.x + WINDOW_W / 2
                const sy  = parentPanel.y + TITLE_H
                const tx  = childPanel.x  + WINDOW_W / 2
                const ty  = childPanel.y
                const mid = (sy + ty) / 2
                return (
                  <path
                    key={`${parentPanel.id}-${childPanel.id}`}
                    d={`M ${sx} ${sy} C ${sx} ${mid} ${tx} ${mid} ${tx} ${ty}`}
                    fill="none" stroke="#b8a89a" strokeWidth="1.5" strokeDasharray="5 3"
                  />
                )
              })}
            </svg>

            {/* ウィンドウ群 */}
            {standalonePanels.map(panel => {
              const count = beforeSubtreeRowCount(panel.orgId, beforeOrganizations, beforeRowsByOrgId)
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
    </BeforeOrgViewContext.Provider>
  )
}
