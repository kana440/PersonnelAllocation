import { useRef, useEffect, useLayoutEffect } from 'react'
import { useCanvasLayoutStore, VIEW_MODE_WIDTHS } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import type { Organization }    from '@personnel/domain/schemas'
import { EST_WIN_H, computeScrollToPanel } from '../treeWindowLayout'

/**
 * orgId に対応するパネルへ、座標計算だけでスクロール位置をジャンプさせる
 * （対象パネルが仮想化で未描画でも、座標さえ分かれば呼べるのがポイント）。
 * 呼び出し側は、この後 1 フレーム待ってから DOM 検索の細かい位置調整を行うこと
 * （このジャンプで発生したスクロールが usePanelVirtualization の可視判定を
 * 更新し、対象パネルが実際に描画されるまでに rAF 1回分の猶予が要るため）。
 */
function jumpToPanelByOrgId(
  scroller: HTMLElement,
  orgId: string,
  displayPanelsRef: React.RefObject<PanelDef[]>,
): boolean {
  const panel = displayPanelsRef.current.find(p => p.orgId === orgId)
  if (!panel) return false
  const { canvasPanelStyle, panelHeights, canvasZoom } = useCanvasLayoutStore.getState()
  const winW   = VIEW_MODE_WIDTHS[canvasPanelStyle]
  const panelH = panelHeights[panel.id] ?? EST_WIN_H
  const { left, top } = computeScrollToPanel(panel, winW, panelH, canvasZoom, scroller.clientWidth, scroller.clientHeight)
  scroller.scrollLeft = left
  scroller.scrollTop  = top
  return true
}

export function useCanvasScroll(
  displayPanels: PanelDef[],
  organizations: Organization[],
  orgById: Map<string, Organization>,
  rowIdToOrgId: Map<number, string>,
) {
  const scrollerRef       = useRef<HTMLDivElement>(null)
  const displayPanelsRef  = useRef(displayPanels)
  const organizationsRef  = useRef(organizations)

  useEffect(() => { displayPanelsRef.current = displayPanels }, [displayPanels])
  useEffect(() => { organizationsRef.current = organizations }, [organizations])

  // マウント時: 選択中の行/組織へジャンプ（レビュー画面等の他ビューから戻ってきた場合を含む）。
  // 対象が閉じたパネルの奥にあることがある（初期表示はルート組織のみ open のため）ので、
  // 祖先を openOrgAncestors で開いてから rAF で1フレーム待って探す
  // （openOrgAncestors → 別 useEffect で登録される subscribe リスナーへの通知も rAF 後なら間に合う）。
  //
  // 仮想化（画面外パネル非描画）対応: 祖先を開いただけでは対象パネルが可視範囲外だと
  // 描画されないため、1フレーム目で座標ジャンプ（可視範囲に入れる）→ 2フレーム目で
  // DOM 検索という2段階にする。
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const { selectedCardRowId, selectedOrgId } = useStore.getState()

    if (selectedCardRowId !== null) {
      const orgId = rowIdToOrgId.get(selectedCardRowId)
      if (orgId) useCanvasLayoutStore.getState().openOrgAncestors(orgId, orgById)
      requestAnimationFrame(() => {
        if (orgId) jumpToPanelByOrgId(el, orgId, displayPanelsRef)
        requestAnimationFrame(() => {
          const rowEl = el.querySelector<HTMLElement>(`[data-rowid="${selectedCardRowId}"]`)
          if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
            return
          }
          // 選択行が見つからない場合は保存済みスクロール位置を復元
          const { left, top } = useCanvasLayoutStore.getState().canvasScrollPos
          el.scrollLeft = left
          el.scrollTop  = top
        })
      })
      return
    }

    if (selectedOrgId) {
      useCanvasLayoutStore.getState().openOrgAncestors(selectedOrgId, orgById)
      requestAnimationFrame(() => useCanvasLayoutStore.getState().requestScrollToOrg(selectedOrgId))
      return
    }

    // 選択なし → 保存済みスクロール位置を復元
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
      if (!state.scrollToRowRequest) return
      const rowId = state.scrollToRowRequest.rowId
      useCanvasLayoutStore.getState().requestScrollToRow(null)
      const orgId = rowIdToOrgId.get(rowId)
      // ナビからのクリックは同じハンドラ内で setOrgOpen によりパネルを新規に開くことがあり、
      // その DOM 反映（React の commit）は subscribe コールバックより後になる。
      // rAF で1フレーム待ってから座標ジャンプ→さらに1フレーム後に DOM 検索、という2段階にする。
      requestAnimationFrame(() => {
        const el = scrollerRef.current
        if (!el) return
        if (orgId) jumpToPanelByOrgId(el, orgId, displayPanelsRef)
        requestAnimationFrame(() => {
          const rowEl = el.querySelector<HTMLElement>(`[data-rowid="${rowId}"]`)
          rowEl?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
        })
      })
    })
  }, [rowIdToOrgId])

  // 組織パネルを中央にスクロール。
  // inline セクション（data-orgsectionid）を優先し、なければ祖先パネルにフォールバック。
  useEffect(() => {
    return useCanvasLayoutStore.subscribe((state, prev) => {
      if (state.scrollToOrgId === prev.scrollToOrgId) return
      if (!state.scrollToOrgId) return
      const scrollToOrgId = state.scrollToOrgId
      useCanvasLayoutStore.getState().requestScrollToOrg(null)

      // ナビからのクリックは同じハンドラ内で setOrgOpen によりパネルを新規に開くことがあり、
      // その DOM 反映（React の commit）・displayPanelsRef の更新は subscribe コールバックより後になる。
      // 1フレーム目で座標ジャンプ（仮想化の可視範囲に入れる）→ 2フレーム目で DOM 検索・微調整。
      requestAnimationFrame(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        jumpToPanelByOrgId(scroller, scrollToOrgId, displayPanelsRef)

        requestAnimationFrame(() => {
          const sectionEl = scroller.querySelector<HTMLElement>(
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

          const el = scroller.querySelector<HTMLElement>(`[data-panelid="${panel.id}"]`)
          if (!el) return
          const elRect       = el.getBoundingClientRect()
          const scrollerRect = scroller.getBoundingClientRect()
          const TOP_MARGIN   = 16
          const scrollTop    = elRect.height > scrollerRect.height
            ? elRect.top  - scrollerRect.top - TOP_MARGIN
            : elRect.top  - scrollerRect.top - scrollerRect.height / 2 + elRect.height / 2
          scroller.scrollBy({
            left: elRect.left - scrollerRect.left - scrollerRect.width  / 2 + elRect.width  / 2,
            top:  scrollTop,
            behavior: 'instant',
          })
        })
      })
    })
  }, [])

  return { scrollerRef }
}
