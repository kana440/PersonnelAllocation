import { useRef, useEffect, useLayoutEffect } from 'react'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import type { Organization }    from '@personnel/domain/schemas'

export function useCanvasScroll(
  displayPanels: PanelDef[],
  organizations: Organization[],
) {
  const scrollerRef       = useRef<HTMLDivElement>(null)
  const displayPanelsRef  = useRef(displayPanels)
  const organizationsRef  = useRef(organizations)

  useEffect(() => { displayPanelsRef.current = displayPanels }, [displayPanels])
  useEffect(() => { organizationsRef.current = organizations }, [organizations])

  // マウント時: ペイント前に選択行へ即ジャンプ（または保存位置を復元）
  // useLayoutEffect = DOM 確定後・ブラウザ描画前に同期実行 → スクロールアニメが見えない
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const selectedCardRowId = useStore.getState().selectedCardRowId
    if (selectedCardRowId !== null) {
      const rowEl = el.querySelector<HTMLElement>(`[data-rowid="${selectedCardRowId}"]`)
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
        return
      }
    }
    // 選択行が見つからない場合は保存済みスクロール位置を復元
    const { left, top } = useCanvasLayoutStore.getState().canvasScrollPos
    el.scrollLeft = left
    el.scrollTop  = top
  }, []) // マウント時のみ

  // スクロール位置を保存（表示切替後の復元に使用）
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      useCanvasLayoutStore.getState().saveCanvasScrollPos(el.scrollLeft, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // 行要素を中央にスクロール。
  // scrollIntoView によりパネルボディ（overflow-y-auto）とキャンバス外側の
  // 両スクロールコンテナを自動処理する。
  // 命令型 subscribe でスクロール処理することで TreeWindowCanvas の再レンダーを防ぐ。
  useEffect(() => {
    return useCanvasLayoutStore.subscribe((state, prev) => {
      if (state.scrollToRowRequest === prev.scrollToRowRequest) return
      if (!state.scrollToRowRequest || !scrollerRef.current) return
      useCanvasLayoutStore.getState().requestScrollToRow(null)
      const el = scrollerRef.current.querySelector<HTMLElement>(
        `[data-rowid="${state.scrollToRowRequest.rowId}"]`,
      )
      if (!el) return
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    })
  }, [])

  // 組織パネルを中央にスクロール。
  // inline セクション（data-orgsectionid）を優先し、なければ祖先パネルにフォールバック。
  useEffect(() => {
    return useCanvasLayoutStore.subscribe((state, prev) => {
      if (state.scrollToOrgId === prev.scrollToOrgId) return
      if (!state.scrollToOrgId || !scrollerRef.current) return
      const scrollToOrgId = state.scrollToOrgId
      useCanvasLayoutStore.getState().requestScrollToOrg(null)

      const sectionEl = scrollerRef.current.querySelector<HTMLElement>(
        `[data-orgsectionid="${scrollToOrgId}"]`,
      )
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        return
      }

      const panels = displayPanelsRef.current
      const orgs   = organizationsRef.current

      let panel = panels.find(p => p.orgId === scrollToOrgId)
      if (!panel) {
        let cur = orgs.find(o => o.id === scrollToOrgId)
        cur = cur?.parentId ? orgs.find(o => o.id === cur!.parentId) : undefined
        while (cur) {
          panel = panels.find(p => p.orgId === cur!.id)
          if (panel) break
          cur = cur.parentId ? orgs.find(o => o.id === cur!.parentId) : undefined
        }
      }
      if (!panel) return

      const el = scrollerRef.current.querySelector<HTMLElement>(`[data-panelid="${panel.id}"]`)
      if (!el) return
      const elRect       = el.getBoundingClientRect()
      const scrollerRect = scrollerRef.current.getBoundingClientRect()
      const TOP_MARGIN   = 16
      const scrollTop    = elRect.height > scrollerRect.height
        ? elRect.top  - scrollerRect.top - TOP_MARGIN
        : elRect.top  - scrollerRect.top - scrollerRect.height / 2 + elRect.height / 2
      scrollerRef.current.scrollBy({
        left: elRect.left - scrollerRect.left - scrollerRect.width  / 2 + elRect.width  / 2,
        top:  scrollTop,
        behavior: 'instant',
      })
    })
  }, [])

  return { scrollerRef }
}
