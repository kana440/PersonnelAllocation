import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStore }   from '../../../store/useStore'
import { useOrgView } from '../OrgViewContext'

type BandRect = { x1: number; y1: number; x2: number; y2: number }

export function useCanvasInteraction(scrollerRef: React.RefObject<HTMLDivElement | null>) {
  const clearAllSelection             = useStore(s => s.clearAllSelection)
  const { addPersonsToSelection, clearSelection } = useOrgView()

  // ── ESC キーで選択をまとめてクリア ────────────────────────────────
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') clearAllSelection() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [clearAllSelection])

  // ── Space キー保持（パンモード切り替え）──────────────────────────
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
  const panningRef             = useRef(false)
  const panOrigin              = useRef({ mx: 0, my: 0, sl: 0, st: 0 })

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
  }, [panning, scrollerRef])

  // ── ラバーバンド選択 ──────────────────────────────────────────────
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
  }, [spaceHeld, scrollerRef])

  useEffect(() => {
    if (!band) return
    // mousemove は高頻度で発火するため、setBand（TreeWindowCanvas の再レンダーを引き起こす）は
    // 1フレームに1回までに間引く（矩形選択の当たり判定自体は mouseup 時に最新の座標で行うため
    // 間引いても選択結果は変わらない）
    let raf = 0
    const onMove = (e: MouseEvent) => {
      bandRef.current = { ...bandRef.current!, x2: e.clientX, y2: e.clientY }
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setBand(bandRef.current) })
    }
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf)
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
          clearAllSelection()
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

  return { spaceHeld, panning, band, handleCanvasMouseDown }
}
