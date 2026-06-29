import { useCallback } from 'react'
import type { Organization }     from '@personnel/domain/schemas'
import type { ChildrenMode, PanelDef } from '../../../store/canvasLayoutStore'
import { ToggleTrack }           from '../toolbar/ToggleTrack'

/**
 * getDescendantOrgIds の汎用版。childrenByOrgId Map を使うので O(N) に留まる。
 */
export function getDescOrgIds(
  startId:         string,
  childrenByOrgId: Map<string, Organization[]>,
  hasItems:        (id: string) => boolean,
  directOnly?:     boolean,
): string[] {
  const result: string[] = []
  const children = childrenByOrgId.get(startId) ?? []
  for (const child of children) {
    if (!hasItems(child.id)) continue
    result.push(child.id)
    if (!directOnly) result.push(...getDescOrgIds(child.id, childrenByOrgId, hasItems, false))
  }
  return result
}

interface ControlsAdapter {
  panel:            PanelDef
  currentRootId:    string
  childrenByOrgId:  Map<string, Organization[]>
  hasItems:         (id: string) => boolean
  getPanelByOrgId:  (orgId: string) => PanelDef | undefined
  setChildrenMode:  (panelId: string, mode: ChildrenMode) => void
  setCollapsedOrgIds: (panelId: string, ids: string[]) => void
  openOrg:          (orgId: string) => void
  closeOrg:         (orgId: string) => void
  /** after 側のみ */
  addPanel?:        (orgId: string, opts?: { childrenMode?: ChildrenMode; collapsedOrgIds?: string[] }) => void
  removeOrgPanels?: (orgIds: string[]) => void
  onSelectOrg?:     (orgId: string) => void
}

interface Props {
  ca: ControlsAdapter
  hasChildren: boolean
}

export function OrgTreeControls({ ca, hasChildren }: Props) {
  const { panel, currentRootId, childrenByOrgId, hasItems, getPanelByOrgId,
          setChildrenMode, setCollapsedOrgIds, openOrg, closeOrg,
          addPanel, removeOrgPanels, onSelectOrg } = ca

  const desc = useCallback((id: string, directOnly?: boolean) =>
    getDescOrgIds(id, childrenByOrgId, hasItems, directOnly),
    [childrenByOrgId, hasItems],
  )

  const handleCollapseAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (panel.childrenMode === 'windowed') {
      ids.forEach(id => closeOrg(id))
    } else {
      setCollapsedOrgIds(panel.id, ids)
    }
  }, [currentRootId, panel, desc, closeOrg, setCollapsedOrgIds])

  const handleExpandChildren = useCallback(() => {
    const directIds = desc(currentRootId, true)
    if (panel.childrenMode === 'windowed') {
      directIds.forEach(id => {
        const allDesc = desc(id)
        const existing = getPanelByOrgId(id)
        if (existing) {
          openOrg(id)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel?.(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
    } else {
      const direct = new Set(directIds)
      const all    = desc(currentRootId)
      setCollapsedOrgIds(panel.id, all.filter(id => !direct.has(id)))
    }
  }, [currentRootId, panel, desc, getPanelByOrgId, openOrg, setChildrenMode, setCollapsedOrgIds, addPanel])

  const handleExpandAll = useCallback(() => {
    const ids = desc(currentRootId)
    if (panel.childrenMode === 'windowed') {
      ids.forEach(id => {
        const existing = getPanelByOrgId(id)
        if (existing) { openOrg(id); setChildrenMode(existing.id, 'windowed') }
        else addPanel?.(id, { childrenMode: 'windowed' })
      })
    } else {
      setCollapsedOrgIds(panel.id, [])
    }
  }, [currentRootId, panel, desc, getPanelByOrgId, openOrg, setChildrenMode, setCollapsedOrgIds, addPanel])

  const handleToggleMode = useCallback(() => {
    const directIds = desc(currentRootId, true)
    const allIds    = desc(currentRootId)
    if (panel.childrenMode === 'windowed') {
      const direct = new Set(directIds)
      setCollapsedOrgIds(panel.id, allIds.filter(id => !direct.has(id)))
      removeOrgPanels?.(allIds)
      setChildrenMode(panel.id, 'inline')
    } else {
      directIds.forEach(id => {
        const allDesc  = desc(id)
        const existing = getPanelByOrgId(id)
        if (existing) {
          openOrg(id)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel?.(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
      setChildrenMode(panel.id, 'windowed')
    }
    onSelectOrg?.(panel.orgId)
  }, [panel, currentRootId, desc, getPanelByOrgId, setCollapsedOrgIds, removeOrgPanels, setChildrenMode, openOrg, addPanel, onSelectOrg])

  if (!panel.open || !hasChildren) return null
  const isContained = panel.childrenMode === 'inline'

  return (
    <div className="flex-shrink-0 flex items-stretch bg-gray-50 border-b border-gray-200" style={{ height: 24 }}>
      {([
        { label: 'たたむ', onClick: handleCollapseAll,    title: 'すべての子組織を折りたたむ' },
        { label: '子のみ', onClick: handleExpandChildren, title: '直接の子だけ展開（孫はたたむ）' },
        { label: '全展開', onClick: handleExpandAll,      title: 'すべての子孫を展開' },
      ] as const).map(({ label, onClick, title }) => (
        <button key={label} onClick={onClick} title={title}
          className="flex-1 text-[9px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-r border-gray-200 transition-colors">
          {label}
        </button>
      ))}
      <div className="w-px bg-gray-200 flex-shrink-0" />
      <button role="switch" aria-checked={isContained} onClick={handleToggleMode}
        title={isContained
          ? '縦並モード: 子組織をこの中に縦並びで表示（クリックで個別に切り替え）'
          : '個別モード: 子組織を別ウィンドウで表示（クリックで縦並びに切り替え）'}
        className="flex items-center gap-1.5 px-2.5 flex-shrink-0 h-full hover:bg-gray-100 transition-colors">
        <span className={`text-[9px] font-medium transition-colors ${isContained ? 'text-blue-600' : 'text-gray-400'}`}>縦並</span>
        <ToggleTrack on={isContained} />
      </button>
    </div>
  )
}
