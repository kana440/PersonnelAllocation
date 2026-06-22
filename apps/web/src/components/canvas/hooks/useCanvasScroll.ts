import { useRef, useEffect } from 'react'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import type { Organization }    from '@personnel/domain/schemas'

export function useCanvasScroll(
  displayPanels: PanelDef[],
  organizations: Organization[],
) {
  const { scrollToRowRequest, requestScrollToRow, scrollToOrgId, requestScrollToOrg } = useCanvasLayoutStore()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // 行要素を中央にスクロール。
  // scrollIntoView によりパネルボディ（overflow-y-auto）とキャンバス外側の
  // 両スクロールコンテナを自動処理する。seq 変化で同一 rowId の連続リクエストも処理できる。
  useEffect(() => {
    if (!scrollToRowRequest || !scrollerRef.current) return
    requestScrollToRow(null)
    const el = scrollerRef.current.querySelector<HTMLElement>(`[data-rowid="${scrollToRowRequest.rowId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [scrollToRowRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  // 組織パネルを中央にスクロール。
  // inline セクション（data-orgsectionid）を優先し、なければ祖先パネルにフォールバック。
  useEffect(() => {
    if (!scrollToOrgId || !scrollerRef.current) return
    requestScrollToOrg(null)

    const sectionEl = scrollerRef.current.querySelector<HTMLElement>(`[data-orgsectionid="${scrollToOrgId}"]`)
    if (sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      return
    }

    let panel = displayPanels.find(p => p.orgId === scrollToOrgId)
    if (!panel) {
      let cur = organizations.find(o => o.id === scrollToOrgId)
      cur = cur?.parentId ? organizations.find(o => o.id === cur!.parentId) : undefined
      while (cur) {
        panel = displayPanels.find(p => p.orgId === cur!.id)
        if (panel) break
        cur = cur.parentId ? organizations.find(o => o.id === cur!.parentId) : undefined
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
      behavior: 'smooth',
    })
  }, [scrollToOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { scrollerRef }
}
