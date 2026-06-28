import { useCallback } from 'react'
import { useOrgView }           from '../OrgViewContext'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { getDescendantOrgIds }  from '../panel/helpers'
import { ToggleTrack }          from '../components/ToggleTrack'

interface TreeWindowControlsProps {
  panel:         PanelDef
  currentRootId: string
}

export function TreeWindowControls({ panel, currentRootId }: TreeWindowControlsProps) {
  const { organizations, positionTreeByOrgId } = useOrgView()
  const {
    panels, addPanel, setOrgOpen, setChildrenMode, setCollapsedOrgIds, removeOrgPanels,
  } = useCanvasLayoutStore()
  const selectOrg = useStore(s => s.selectOrg)

  const hasRowsFn = (id: string) => positionTreeByOrgId.has(id)
  const desc      = (id: string, directOnly?: boolean) => getDescendantOrgIds(id, organizations, hasRowsFn, directOnly)

  // 行の有無に関わらず子組織が存在すれば展開コントロールを表示する
  const hasChildren = organizations.some(o => o.parentId === currentRootId)
  const isContained = panel.childrenMode === 'inline'

  const handleCollapseAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (panel.childrenMode === 'windowed') ids.forEach(id => setOrgOpen(id, false))
    else setCollapsedOrgIds(panel.id, ids)
  }, [currentRootId, organizations, positionTreeByOrgId, panel, setOrgOpen, setCollapsedOrgIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpandChildren = useCallback(() => {
    const directChildIds = desc(currentRootId, true)
    if (panel.childrenMode === 'windowed') {
      directChildIds.forEach(id => {
        const allDesc  = desc(id)
        const existing = panels.find(p => p.orgId === id)
        if (existing) {
          setOrgOpen(id, true)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
    } else {
      const direct = new Set(directChildIds)
      const all    = desc(currentRootId)
      setCollapsedOrgIds(panel.id, all.filter(id => !direct.has(id)))
    }
  }, [currentRootId, organizations, positionTreeByOrgId, panel, panels, addPanel, setOrgOpen, setChildrenMode, setCollapsedOrgIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpandAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (panel.childrenMode === 'windowed') {
      ids.forEach(id => {
        const existing = panels.find(p => p.orgId === id)
        if (existing) { setOrgOpen(id, true); setChildrenMode(existing.id, 'windowed') }
        else addPanel(id, { childrenMode: 'windowed' })
      })
    } else {
      setCollapsedOrgIds(panel.id, [])
    }
  }, [currentRootId, organizations, positionTreeByOrgId, panel, panels, addPanel, setOrgOpen, setChildrenMode, setCollapsedOrgIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleIndividualMode = useCallback(() => {
    const directChildIds = desc(currentRootId, true)
    const allIds         = desc(currentRootId)
    if (panel.childrenMode === 'windowed') {
      const direct = new Set(directChildIds)
      setCollapsedOrgIds(panel.id, allIds.filter(id => !direct.has(id)))
      removeOrgPanels(allIds)
      setChildrenMode(panel.id, 'inline')
    } else {
      directChildIds.forEach(id => {
        const allDesc  = desc(id)
        const existing = panels.find(p => p.orgId === id)
        if (existing) {
          setOrgOpen(id, true)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
      setChildrenMode(panel.id, 'windowed')
    }
    selectOrg(panel.orgId)
  }, [panel, panels, currentRootId, organizations, positionTreeByOrgId, setCollapsedOrgIds, removeOrgPanels, setChildrenMode, addPanel, setOrgOpen, selectOrg]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!panel.open || !hasChildren) return null

  return (
    <div className="flex-shrink-0 flex items-stretch bg-gray-50 border-b border-gray-200" style={{ height: 24 }}>
      {([
        { label: 'たたむ', onClick: handleCollapseAll,    title: 'すべての子組織を折りたたむ' },
        { label: '子のみ', onClick: handleExpandChildren, title: '直接の子だけ展開（孫はたたむ）' },
        { label: '全展開', onClick: handleExpandAll,      title: 'すべての子孫を展開' },
      ] as const).map(({ label, onClick, title }) => (
        <button
          key={label}
          onClick={onClick}
          title={title}
          className="flex-1 text-[9px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-r border-gray-200 transition-colors"
        >
          {label}
        </button>
      ))}
      <div className="w-px bg-gray-200 flex-shrink-0" />
      <button
        role="switch"
        aria-checked={isContained}
        onClick={handleToggleIndividualMode}
        title={isContained
          ? '縦並モード: 子組織をこの中に縦並びで表示（クリックで個別に切り替え）'
          : '個別モード: 子組織を別ウィンドウで表示（クリックで縦並びに切り替え）'}
        className="flex items-center gap-1.5 px-2.5 flex-shrink-0 h-full hover:bg-gray-100 transition-colors"
      >
        <span className={`text-[9px] font-medium transition-colors ${isContained ? 'text-blue-600' : 'text-gray-400'}`}>
          縦並
        </span>
        <ToggleTrack on={isContained} />
      </button>
    </div>
  )
}
