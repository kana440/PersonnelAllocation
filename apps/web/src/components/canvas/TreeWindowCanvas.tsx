import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import type { PanelDef }        from '../../store/canvasLayoutStore'
import { useOrgView }           from './OrgViewContext'
import type { Organization }    from '@personnel/domain/schemas'
import { TreeWindow }           from './tree'

const WINDOW_W  = 288
const TITLE_H   = 28
const EST_WIN_H = 300   // ウィンドウ高さの推定値（整列計算用）
const H_GAP     = 16
const V_GAP     = 20
const MARGIN    = 40    // キャンバス周囲の余白

// ── スタンドアロン判定（再帰）────────────────────────────────────
// スタンドアロン = キャンバス上に独立ウィンドウとして描画されるべきパネル
// ・root 組織（parentId なし）は常にスタンドアロン
// ・子組織は「親が windowed モード AND 自身 open AND 親もスタンドアロン」のとき
// ancestors: 循環参照ガード（組織データに A→B→A のような循環があっても stack overflow しない）
function isStandaloneWindow(
  panel: PanelDef,
  allPanels: PanelDef[],
  orgs: Organization[],
  ancestors = new Set<string>(),
): boolean {
  if (ancestors.has(panel.id)) return true  // 循環 → standalone 扱い
  const org = orgs.find(o => o.id === panel.orgId)
  if (!org?.parentId) return true  // root org
  const parentPanel = allPanels.find(p => p.orgId === org.parentId)
  if (!parentPanel) return true    // 親パネルなし → root 扱い
  const next = new Set(ancestors)
  next.add(panel.id)
  return parentPanel.childrenMode === 'windowed'
    && panel.open
    && isStandaloneWindow(parentPanel, allPanels, orgs, next)
}

// ── 整列レイアウト計算 ─────────────────────────────────────────────
function computeLayout(
  standalonePanels: PanelDef[],
  allPanels: PanelDef[],
  orgs: Organization[],
): Map<string, { x: number; y: number }> {
  const getParentPanel = (p: PanelDef): PanelDef | undefined => {
    const org = orgs.find(o => o.id === p.orgId)
    if (!org?.parentId) return undefined
    return standalonePanels.find(pp => pp.orgId === org.parentId)
  }

  const getChildren = (p: PanelDef): PanelDef[] =>
    standalonePanels.filter(c => {
      if (c.id === p.id) return false
      const org = orgs.find(o => o.id === c.orgId)
      return org?.parentId === p.orgId
    })

  const subtreeW = (p: PanelDef, ancestors = new Set<string>()): number => {
    if (ancestors.has(p.id)) return WINDOW_W  // 循環ガード
    const next = new Set(ancestors)
    next.add(p.id)
    const children = getChildren(p)
    if (children.length === 0) return WINDOW_W
    const childTotal = children.reduce((s, c, i) => s + subtreeW(c, next) + (i ? H_GAP : 0), 0)
    return Math.max(WINDOW_W, childTotal)
  }

  const posMap  = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()

  const layout = (p: PanelDef, x: number, y: number) => {
    if (visited.has(p.id)) return
    visited.add(p.id)
    const sw     = subtreeW(p)
    const panelX = x + Math.max(0, (sw - WINDOW_W) / 2)
    posMap.set(p.id, { x: Math.round(panelX), y })
    const children = getChildren(p)
    let cx = x
    for (const child of children) {
      layout(child, cx, y + EST_WIN_H + V_GAP)
      cx += subtreeW(child) + H_GAP
    }
  }

  const roots = standalonePanels.filter(p => !getParentPanel(p))
  let rootX   = MARGIN
  for (const root of roots) {
    layout(root, rootX, MARGIN)
    rootX += subtreeW(root) + H_GAP
  }

  void allPanels  // 未使用警告抑制（将来の参照用に引数に残す）
  return posMap
}

// ── 接続線ペア導出 ─────────────────────────────────────────────────
interface Connection { parentPanel: PanelDef; childPanel: PanelDef }

function buildConnections(standalonePanels: PanelDef[], orgs: Organization[]): Connection[] {
  const result: Connection[] = []
  for (const child of standalonePanels) {
    const org = orgs.find(o => o.id === child.orgId)
    if (!org?.parentId) continue
    const parent = standalonePanels.find(p => p.orgId === org.parentId)
    if (parent) result.push({ parentPanel: parent, childPanel: child })
  }
  return result
}

// ── コンポーネント ────────────────────────────────────────────────
export function TreeWindowCanvas() {
  const {
    panels, setPositions,
    autoArrange, arrangeVersion, setAutoArrange,
    scrollToPersonId, requestScrollToPerson,
  } = useCanvasLayoutStore()
  const { organizations, addPersonsToSelection, clearSelection } = useOrgView()

  // ── キャンバスパン要求: data-personid 要素をスクロールして中央に ──
  // クリックハンドラーで setOrgOpen + requestScrollToPerson が同一バッチで更新されるため、
  // この effect が動くタイミングではパネルが既に開いており data-personid 要素が DOM にある。
  useEffect(() => {
    if (!scrollToPersonId || !scrollerRef.current) return
    requestScrollToPerson(null)
    const el = scrollerRef.current.querySelector<HTMLElement>(`[data-personid="${scrollToPersonId}"]`)
    if (!el) return
    const elRect       = el.getBoundingClientRect()
    const scrollerRect = scrollerRef.current.getBoundingClientRect()
    scrollerRef.current.scrollBy({
      left: elRect.left - scrollerRect.left - scrollerRect.width  / 2 + elRect.width  / 2,
      top:  elRect.top  - scrollerRect.top  - scrollerRect.height / 2 + elRect.height / 2,
      behavior: 'smooth',
    })
  }, [scrollToPersonId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Space キー保持状態（カーソル変更用）────────────────────────
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

  // スタンドアロンパネル（キャンバス上にウィンドウとして描画するもの）
  const standalonePanels = useMemo(
    () => panels.filter(p => isStandaloneWindow(p, panels, organizations)),
    [panels, organizations],
  )

  const connections = useMemo(
    () => buildConnections(standalonePanels, organizations),
    [standalonePanels, organizations],
  )

  // 動的キャンバスサイズ（スタンドアロンパネルの最大座標 + 余白）
  const canvasWidth  = standalonePanels.length === 0 ? 1200
    : Math.max(1200, ...standalonePanels.map(p => p.x + WINDOW_W + MARGIN * 2))
  const canvasHeight = standalonePanels.length === 0 ? 800
    : Math.max(800, ...standalonePanels.map(p => p.y + EST_WIN_H + MARGIN * 2))

  const handleArrange = useCallback(() => {
    const posMap = computeLayout(standalonePanels, panels, organizations)
    setPositions(posMap)
  }, [standalonePanels, panels, organizations, setPositions])

  // 自動整列: arrangeVersion が上がったら最新データで整列
  const standalonePanelsRef = useRef(standalonePanels)
  standalonePanelsRef.current = standalonePanels
  const panelsRef = useRef(panels)
  panelsRef.current = panels
  const orgsRef = useRef(organizations)
  orgsRef.current = organizations
  useEffect(() => {
    if (arrangeVersion === 0) return
    const posMap = computeLayout(standalonePanelsRef.current, panelsRef.current, orgsRef.current)
    setPositions(posMap)
  }, [arrangeVersion, setPositions])

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

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-window]')) return
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

    // 通常drag: ラバーバンド選択
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
          const ids = new Set<string>()
          document.querySelectorAll<HTMLElement>('[data-personid]:not([data-personid=""])').forEach(el => {
            const r = el.getBoundingClientRect()
            if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
              const pid = el.getAttribute('data-personid')
              if (pid) ids.add(pid)
            }
          })
          if (ids.size > 0) {
            clearSelection()
            addPersonsToSelection(ids)
          }
        } else {
          clearSelection()
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
  }, [band !== null, addPersonsToSelection, clearSelection])  // eslint-disable-line react-hooks/exhaustive-deps

  if (standalonePanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Excel を読み込むと組織が表示されます
      </div>
    )
  }

  return (
    <div className="relative h-full">
      {/* 整列ボタン + 自動整列チェックボックス（キャンバス右上に固定） */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-2">
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoArrange}
            onChange={e => setAutoArrange(e.target.checked)}
            className="w-3 h-3 accent-blue-600"
          />
          <span className="text-[11px] text-gray-600">自動整列</span>
        </label>
        <button
          onClick={handleArrange}
          className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
          title="組織階層に従ってウィンドウを整列"
        >⊞ 整列</button>
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
        <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>

          {/* SVG 接続線レイヤー */}
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
                  fill="none"
                  stroke="#93a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
              )
            })}
          </svg>

          {/* スタンドアロンウィンドウ群 */}
          {standalonePanels.map(panel => (
            <div
              key={panel.id}
              className="absolute"
              style={{ left: panel.x, top: panel.y, width: WINDOW_W, zIndex: 1 }}
            >
              <TreeWindow panel={panel} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
