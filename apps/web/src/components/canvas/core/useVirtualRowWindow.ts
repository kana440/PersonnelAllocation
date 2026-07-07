import { useState, useEffect } from 'react'
import type { RefObject } from 'react'

export interface VirtualWindowResult {
  startIdx:      number
  endIdx:        number
  paddingTop:    number
  paddingBottom: number
}

const ROW_BUFFER = 10

/**
 * 固定行高さを前提にした縦リストの仮想化ウィンドウ計算。
 * apps/web/src/components/review/UnifiedReviewView/UnifiedTable.tsx の
 * 累積高さ配列＋二分探索パターンを、行高さ固定版として汎用化したもの
 * （RowCard は表示チップ数で高さが変わるが、正確な実測はコストが高いため
 * 固定推定値＋大きめのオーバースキャンで吸収する）。
 *
 * scrollerRef が指すスクロールコンテナの先頭（scrollTop=0）から items が
 * 隙間なく並んでいることが前提。同じコンテナ内に他の要素が先に並ぶ場合は
 * 正しく計算できない（そのケースは今回のスコープ外）。
 */
export function useVirtualRowWindow(
  scrollerRef: RefObject<HTMLElement | null>,
  itemCount:   number,
  rowHeight:   number,
): VirtualWindowResult {
  const [scrollTop, setScrollTop] = useState(0)
  const [vpHeight,  setVpHeight]  = useState(0)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    setVpHeight(el.clientHeight)

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setScrollTop(el.scrollTop) })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => setVpHeight(el.clientHeight))
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollerRef])

  const totalHeight = itemCount * rowHeight
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - ROW_BUFFER)
  const endIdx   = Math.min(itemCount, Math.ceil((scrollTop + vpHeight) / rowHeight) + ROW_BUFFER)

  return {
    startIdx,
    endIdx,
    paddingTop:    startIdx * rowHeight,
    paddingBottom: Math.max(0, totalHeight - endIdx * rowHeight),
  }
}
