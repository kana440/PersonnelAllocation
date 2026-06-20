import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import type { PanelDef }        from '../../store/canvasLayoutStore'
import { useStore }             from '../../store/useStore'
import { useOrgView }           from './OrgViewContext'
import type { Organization }    from '@personnel/domain/schemas'
import { TreeWindow }           from './tree'

const WINDOW_W  = 288
const EST_WIN_H = 300   // 実測値未取得時のフォールバック
const H_GAP     = 16
const V_GAP     = 20
const MARGIN    = 40

// ── スタンドアロン判定（再帰）────────────────────────────────────
function isStandaloneWindow(
  panel: PanelDef,
  allPanels: PanelDef[],
  orgs: Organization[],
  ancestors = new Set<string>(),
): boolean {
  if (ancestors.has(panel.id)) return true
  const org = orgs.find(o => o.id === panel.orgId)
  if (!org?.parentId) return true
  const parentPanel = allPanels.find(p => p.orgId === org.parentId)
  if (!parentPanel) return true
  const next = new Set(ancestors)
  next.add(panel.id)
  return parentPanel.childrenMode === 'windowed'
    && panel.open
    && isStandaloneWindow(parentPanel, allPanels, orgs, next)
}

// ── 整列レイアウト計算（純粋関数）────────────────────────────────
function computeLayout(
  standalonePanels: PanelDef[],
  allPanels: PanelDef[],
  orgs: Organization[],
  panelHeights: Record<string, number>,
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

  const getPanelH = (p: PanelDef) => panelHeights[p.id] ?? EST_WIN_H

  const subtreeW = (p: PanelDef, visited = new Set<string>()): number => {
    if (visited.has(p.id)) return WINDOW_W
    const next = new Set(visited); next.add(p.id)
    const children = getChildren(p)
    if (children.length === 0) return WINDOW_W
    const total = children.reduce((s, c, i) => s + subtreeW(c, next) + (i ? H_GAP : 0), 0)
    return Math.max(WINDOW_W, total)
  }

  const posMap  = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()

  const layout = (p: PanelDef, x: number, y: number) => {
    if (visited.has(p.id)) return
    visited.add(p.id)
    const sw     = subtreeW(p)
    posMap.set(p.id, { x: Math.round(x + Math.max(0, (sw - WINDOW_W) / 2)), y })
    let cx = x
    for (const child of getChildren(p)) {
      layout(child, cx, y + getPanelH(p) + V_GAP)
      cx += subtreeW(child) + H_GAP
    }
  }

  const roots = standalonePanels.filter(p => !getParentPanel(p))
  let rootX = MARGIN
  for (const root of roots) {
    layout(root, rootX, MARGIN)
    rootX += subtreeW(root) + H_GAP
  }

  void allPanels
  return posMap
}

// ── 接続線パス生成 ─────────────────────────────────────────────────
function connectionPath(
  parent: PanelDef,
  child: PanelDef,
  panelHeights: Record<string, number>,
  lineStyle: 'bezier' | 'polyline',
): string {
  const parentH = panelHeights[parent.id] ?? EST_WIN_H
  const sx = parent.x + WINDOW_W / 2
  const sy = parent.y + parentH          // 親パネル下中央
  const tx = child.x  + WINDOW_W / 2
  const ty = child.y                     // 子パネル上中央
  const mid = (sy + ty) / 2
  return lineStyle === 'polyline'
    ? `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx} ${mid} ${tx} ${mid} ${tx} ${ty}`
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
    autoArrange, setAutoArrange,
    scrollToPersonId, requestScrollToPerson,
    lineStyle, setLineStyle,
    panelHeights,
    selectedOrgId, scrollToOrgId, requestScrollToOrg,
    clearOrgSelection,
  } = useCanvasLayoutStore()
  const { organizations, addPersonsToSelection, clearSelection } = useOrgView()

  // ── スタンドアロンパネル ──────────────────────────────────────────
  const standalonePanels = useMemo(
    () => panels.filter(p => isStandaloneWindow(p, panels, organizations)),
    [panels, organizations],
  )

  // ── 表示座標の決定 ──────────────────────────────────────────────
  // autoArrange=ON → computeLayout でレンダー内に座標を確定（副作用不要）
  // autoArrange=OFF → panel.x/y の記録済み座標を使用（手動ドラッグ可）
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

  // 動的キャンバスサイズ
  const canvasWidth  = displayPanels.length === 0 ? 1200
    : Math.max(1200, ...displayPanels.map(p => p.x + WINDOW_W + MARGIN * 2))
  const canvasHeight = displayPanels.length === 0 ? 800
    : Math.max(800, ...displayPanels.map(p => p.y + (panelHeights[p.id] ?? EST_WIN_H) + MARGIN * 2))

  // ── 整列ボタン（autoArrange=OFF 時に記録済み座標を上書き） ────────
  const handleArrange = useCallback(() => {
    const posMap = computeLayout(standalonePanels, panels, organizations, panelHeights)
    setPositions(posMap)
  }, [standalonePanels, panels, organizations, panelHeights, setPositions])

  // autoArrange を OFF にする瞬間に現在の計算座標を記録済み座標へ保存
  // → OFF 後すぐに手動ドラッグできる状態にする
  const handleAutoArrangeChange = useCallback((checked: boolean) => {
    if (!checked) {
      const posMap = computeLayout(standalonePanels, panels, organizations, panelHeights)
      setPositions(posMap)
    }
    setAutoArrange(checked)
  }, [standalonePanels, panels, organizations, panelHeights, setPositions, setAutoArrange])

  // ── キャンバスパン要求: data-personid 要素を中央にスクロール ────
  const scrollerRef = useRef<HTMLDivElement>(null)
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

  // ── キャンバスパン要求: data-panelid 要素（組織パネル）を中央にスクロール ──
  useEffect(() => {
    if (!scrollToOrgId || !scrollerRef.current) return
    requestScrollToOrg(null)
    const panel = displayPanels.find(p => p.orgId === scrollToOrgId)
    if (!panel) return
    const el = scrollerRef.current.querySelector<HTMLElement>(`[data-panelid="${panel.id}"]`)
    if (!el) return
    const elRect       = el.getBoundingClientRect()
    const scrollerRect = scrollerRef.current.getBoundingClientRect()
    // パネルが画面高より高い場合はヘッダ上揃え、そうでなければ縦中央
    const TOP_MARGIN = 16
    const scrollTop  = elRect.height > scrollerRect.height
      ? elRect.top  - scrollerRect.top - TOP_MARGIN
      : elRect.top  - scrollerRect.top - scrollerRect.height / 2 + elRect.height / 2
    scrollerRef.current.scrollBy({
      left: elRect.left - scrollerRect.left - scrollerRect.width  / 2 + elRect.width  / 2,
      top:  scrollTop,
      behavior: 'smooth',
    })
  }, [scrollToOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ESC キーで組織・人物選択をクリア ───────────────────────────────
  const clearPersonSelection = useStore(s => s.clearPersonSelection)
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      clearOrgSelection()
      clearPersonSelection()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [clearOrgSelection, clearPersonSelection])

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
  const [panning, setPanning] = useState(false)
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
  const [band,    setBand] = useState<BandRect | null>(null)
  const bandRef            = useRef<BandRect | null>(null)

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-window]')) return
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
          if (ids.size > 0) { clearSelection(); addPersonsToSelection(ids) }
        } else {
          clearSelection()
          clearOrgSelection()
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
  }, [band !== null, addPersonsToSelection, clearSelection]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <label className="flex items-center gap-1 cursor-pointer select-none">
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
          className="px-2.5 py-1 text-[11px] font-medium rounded border shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400"
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

          {/* スタンドアロンウィンドウ群（displayPanels の座標を使用） */}
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
  )
}
