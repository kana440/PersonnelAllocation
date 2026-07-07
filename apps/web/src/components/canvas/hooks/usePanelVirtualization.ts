import { useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { computeVisibleRect, panelRect, rectsIntersect } from '../treeWindowLayout'

/**
 * 開いているパネル数がこの件数以下なら、可視判定を一切せず常に全件を描画対象にする。
 * このスケールなら全件描画してもコストは無視できるうえ、
 * ドラッグ/スクロール中に可視判定の再計算が追いつかず一時的に空欄になる、という
 * 体験上の欠点を避けられる（仮想化が本当に必要なのは、これを大きく超える規模のときだけ）。
 */
const VIRTUALIZATION_THRESHOLD = 100

/**
 * 画面外パネルを描画対象から除外する（パネル単位の仮想化）。
 *
 * スクロール位置そのものは state に持たない（スクロールピクセル単位で全パネルの
 * .map() を再レンダーしないため）。可視パネル id の集合が実際に変化したときだけ
 * setState することで、「パネルが視界に出入りしたとき」だけ再レンダーする。
 *
 * 初期値は空集合（null ではなく）にして useLayoutEffect で最初の計算を行う。
 * スクローラ自身のサイズ（clientWidth/clientHeight）はパネルを1つも描画しなくても
 * 決まる（親の flex レイアウトで決まる）ため、ペイント前に正しい可視集合を
 * 計算でき、「一度全パネルを描画してからすぐ間引く」という二度手間を避けられる。
 */
export function usePanelVirtualization(
  scrollerRef:   React.RefObject<HTMLDivElement | null>,
  displayPanels: PanelDef[],
  winW:          number,
  panelHeights:  Record<string, number>,
  canvasZoom:    number,
): Set<string> {
  const [visiblePanelIds, setVisiblePanelIds] = useState<Set<string>>(() => new Set())

  const recompute = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const t0 = performance.now()

    let next: Set<string>
    if (displayPanels.length <= VIRTUALIZATION_THRESHOLD) {
      next = new Set(displayPanels.map(p => p.id))
    } else {
      const draggingPanelId = useCanvasLayoutStore.getState().draggingPanelId
      const visibleRect = computeVisibleRect(el.scrollLeft, el.scrollTop, el.clientWidth, el.clientHeight, canvasZoom)
      next = new Set<string>()
      for (const p of displayPanels) {
        if (p.id === draggingPanelId || rectsIntersect(panelRect(p, winW, panelHeights), visibleRect)) {
          next.add(p.id)
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[perf] usePanelVirtualization recompute: ${(performance.now() - t0).toFixed(1)}ms (${next.size} visible / ${displayPanels.length} open panels)`)
    setVisiblePanelIds(prev => {
      if (prev.size === next.size && [...next].every(id => prev.has(id))) return prev
      return next
    })
  }, [scrollerRef, displayPanels, winW, panelHeights, canvasZoom])

  // ペイント前に計算（スクロール位置の復元・ジャンプ処理は useCanvasScroll の
  // useLayoutEffect が先に走る前提。呼び出し側で useCanvasScroll → 本フックの順に呼ぶこと）
  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  // スクロール時（rAF で間引く）
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; recompute() })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [scrollerRef, recompute])

  // スクローラ自体のリサイズ時（ウィンドウリサイズ・サイドバー開閉等）
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollerRef, recompute])

  // ドラッグ中パネルの切り替わり（開始/終了）でも再計算する
  // （ドラッグ中は常に可視集合に含め、終了したら通常の交差判定に戻す）
  useEffect(() => {
    return useCanvasLayoutStore.subscribe((state, prev) => {
      if (state.draggingPanelId === prev.draggingPanelId) return
      recompute()
    })
  }, [recompute])

  return visiblePanelIds
}
