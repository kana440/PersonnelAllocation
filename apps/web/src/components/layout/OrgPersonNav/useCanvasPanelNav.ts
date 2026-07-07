import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { useStore } from '../../../store/useStore'
import type { Organization } from '@personnel/domain/schemas'

export function useCanvasPanelNav(
  viewOrgs: Organization[],
  _selectPerson: (id: string) => void,  // 後方互換のため残存（未使用）
) {
  const { panels, setOrgOpen, openOrgAncestors, addPanel, setCollapsedOrgIds, requestScrollToRow } = useCanvasLayoutStore(
    useShallow(s => ({
      panels:             s.panels,
      setOrgOpen:         s.setOrgOpen,
      openOrgAncestors:   s.openOrgAncestors,
      addPanel:           s.addPanel,
      setCollapsedOrgIds: s.setCollapsedOrgIds,
      requestScrollToRow: s.requestScrollToRow,
    }))
  )
  const selectOrg  = useStore(s => s.selectOrg)
  const selectCard = useStore(s => s.selectCard)

  const openCanvasPanel = (orgId: string) => {
    const orgMap = new Map(viewOrgs.map(o => [o.id, o]))

    // 親が inline モードの子パネル = ghost（windowed→inline 切り替え後の残留パネル）。
    // ghost は実際のキャンバス描画に使われていないためスキップし、上のアクティブな祖先まで上る。
    const isActivePanel = (p: PanelDef): boolean => {
      const org = orgMap.get(p.orgId)
      if (!org?.parentId) return true
      const parentPanel = panels.find(pp => pp.orgId === org.parentId)
      if (!parentPanel) return true
      if (parentPanel.childrenMode === 'inline') return false
      return isActivePanel(parentPanel)
    }

    const exactPanel = panels.find(pp => pp.orgId === orgId)
    if (exactPanel && isActivePanel(exactPanel)) {
      // 初期表示はルート組織のみ open のため、対象自身だけでなく閉じている祖先も
      // 全て開く（1つでも祖先が閉じていると isStandaloneWindow が false になり非表示のまま）。
      // 兄弟や親の兄弟には触れない。
      openOrgAncestors(orgId, orgMap)
      return
    }
    // ゴースト（inline 切り替え後の残留パネル）または exactPanel なし → 祖先ウォークで開く

    let cur: Organization | undefined = orgMap.get(orgId)?.parentId
      ? orgMap.get(orgMap.get(orgId)!.parentId!)
      : undefined
    while (cur) {
      const p = panels.find(pp => pp.orgId === cur!.id)
      if (p && isActivePanel(p)) {
        if (!p.open) setOrgOpen(cur.id, true)
        const path: string[] = []
        let pathCur = orgMap.get(orgId)
        while (pathCur && pathCur.id !== p.orgId) {
          path.unshift(pathCur.id)
          pathCur = pathCur.parentId ? orgMap.get(pathCur.parentId) : undefined
        }
        if (p.childrenMode === 'windowed') {
          for (const id of path) addPanel(id)
        } else {
          const pathSet = new Set(path)
          if (p.collapsedOrgIds.some(id => pathSet.has(id)))
            setCollapsedOrgIds(p.id, p.collapsedOrgIds.filter(id => !pathSet.has(id)))
        }
        return
      }
      cur = cur.parentId ? orgMap.get(cur.parentId) : undefined
    }
  }

  const handlePersonClick = (rowId: number, orgId: string) => {
    selectCard(rowId, 'after')
    openCanvasPanel(orgId)
    requestScrollToRow(rowId)
  }

  const handleOrgClick = (orgId: string) => {
    openCanvasPanel(orgId)
    selectOrg(orgId)
  }

  return { handlePersonClick, handleOrgClick, openCanvasPanel }
}
