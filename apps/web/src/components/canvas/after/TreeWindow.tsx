import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Organization }       from '@personnel/domain/schemas'
import { isSecondmentOrg }         from '@personnel/domain/derivation'
import { useOrgView }              from '../OrgViewContext'
import { useCanvasLayoutStore }    from '../../../store/canvasLayoutStore'
import type { PanelDef }           from '../../../store/canvasLayoutStore'
import { useStore }                from '../../../store/useStore'
import { OrgTreePanel }            from '../core/OrgTreePanel'
import { OrgTreeNode }             from '../core/OrgTreeNode'
import { OrgTreeControls }         from '../core/OrgTreeControls'
import type { OrgTreeConfig, PanelTreeAdapter } from '../core/types'
import { TreeWindowHeader }        from './TreeWindowHeader'
import { AddRowDropdown }          from '../AddRowDropdown'
import { BandMatrixPanel }         from '../panel/BandMatrixPanel'
import { RowCard }                 from '../panel/RowCard'

function subtreeSize(orgId: string, childrenByOrgId: Map<string, Organization[]>, getCount: (id: string) => number): number {
  let n = getCount(orgId)
  for (const c of childrenByOrgId.get(orgId) ?? []) n += subtreeSize(c.id, childrenByOrgId, getCount)
  return n
}

interface TreeWindowProps {
  panel:       PanelDef
  isSelected?: boolean
}

export function TreeWindow({ panel, isSelected = false }: TreeWindowProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const {
    panels, setPosition, toggleOpen, setOrgOpen, addPanel,
    setChildrenMode, setCollapsedOrgIds, removeOrgPanels, setPanelHeight,
    panelViewMode, canvasZoom,
  } = useCanvasLayoutStore()

  const masters   = useStore(s => s.masters)
  const selectOrg = useStore(s => s.selectOrg)
  const selectedOrgId = useStore(s => s.selectedOrgId)

  // ── O(1) ルックアップ Map（organizations が変わるときのみ再構築）──
  const orgById = useMemo(() => new Map(organizations.map(o => [o.id, o])), [organizations])
  const childrenByOrgId = useMemo(() => {
    const m = new Map<string, Organization[]>()
    for (const o of organizations) {
      if (!o.parentId) continue
      const arr = m.get(o.parentId)
      if (arr) arr.push(o)
      else m.set(o.parentId, [o])
    }
    return m
  }, [organizations])

  const getItemCount = useCallback((id: string) => positionTreeByOrgId.get(id)?.length ?? 0, [positionTreeByOrgId])

  // ── ヘッダー色 ──────────────────────────────────────────────────
  const getHeaderBg = useCallback((orgId: string) => {
    const org  = orgById.get(orgId)
    const hasRows = subtreeSize(orgId, childrenByOrgId, getItemCount) > 0
    const isSecondment = org?.externalCode ? isSecondmentOrg(org.externalCode, masters) : false
    return isSecondment ? '#2e7d52' : !hasRows ? '#b54520' : '#3c7abf'
  }, [orgById, childrenByOrgId, getItemCount, masters])

  const headerBg = getHeaderBg(panel.orgId)

  // ── ブレッドクラムナビゲーション ───────────────────────────────
  const [rootPath, setRootPath] = useState([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = orgById.get(currentRootId)

  const navigateTo    = useCallback((childOrgId: string) => {
    setRootPath(prev => [...prev, childOrgId])
    setCollapsedOrgIds(panel.id, [])
  }, [panel.id, setCollapsedOrgIds])

  const navigateToIdx = useCallback((idx: number) => {
    setRootPath(prev => prev.slice(0, idx + 1))
    setCollapsedOrgIds(panel.id, [])
  }, [panel.id, setCollapsedOrgIds])

  // ── 折りたたみ状態 ───────────────────────────────────────────────
  const collapsedOrgs = useMemo(() => new Set(panel.collapsedOrgIds), [panel.collapsedOrgIds])
  const onOrgCollapse = useCallback((id: string) =>
    setCollapsedOrgIds(panel.id, [...panel.collapsedOrgIds, id]),
    [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds],
  )
  const onOrgExpand = useCallback((id: string) =>
    setCollapsedOrgIds(panel.id, panel.collapsedOrgIds.filter(x => x !== id)),
    [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds],
  )

  // ── 開閉トグル ───────────────────────────────────────────────────
  const handleToggleOpen = useCallback(() => {
    const nextOpen = !panel.open
    toggleOpen(panel.id)
    if (nextOpen) selectOrg(panel.orgId)
    else selectOrg(orgById.get(panel.orgId)?.parentId ?? panel.orgId)
  }, [panel, toggleOpen, selectOrg, orgById])

  const totalCount = subtreeSize(currentRootId, childrenByOrgId, getItemCount)
  const isDragOver = dragOverOrgId === currentRootId

  // ── PanelTreeAdapter（after 側） ────────────────────────────────
  const adapter: PanelTreeAdapter = useMemo(() => ({
    getPanelByOrgId: (orgId) => panels.find(p => p.orgId === orgId),
    getChildrenMode: (panelId) => panels.find(p => p.id === panelId)?.childrenMode ?? 'inline',
    openOrg:         (orgId) => setOrgOpen(orgId, true),
    closeOrg:        (orgId) => setOrgOpen(orgId, false),
    addPanel,
  }), [panels, setOrgOpen, addPanel])

  // ── OrgTreeConfig ─────────────────────────────────────────────
  const config: OrgTreeConfig = useMemo(() => ({
    orgs: organizations,
    orgById,
    childrenByOrgId,
    getItemCount,
    renderItems: (orgId, panelId) => {
      const entries = positionTreeByOrgId.get(orgId) ?? []
      return entries.map(e => <RowCard key={e.row.rowId} entry={e} orgId={orgId} panelId={panelId} />)
    },
    renderFlatItems: (orgId, panelId) => <BandMatrixPanel orgId={orgId} panelId={panelId} />,
    renderOrgExtra: (orgId) => {
      const org = orgById.get(orgId)
      if (!org?.externalCode) return null
      return <AddRowDropdown orgCode={org.externalCode} variant="inline" />
    },
    showEmptyOrgs: true,
    getHeaderBg,
    accentColor: 'blue',
    dragHandlers: {
      handleDragOver,
      handleDragLeave,
      handleDrop,
      dragOverOrgId,
    },
    selectedOrgId: selectedOrgId ?? undefined,
    onSelectOrg: selectOrg,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [organizations, orgById, childrenByOrgId, getItemCount, positionTreeByOrgId, getHeaderBg, handleDragOver, handleDragLeave, handleDrop, dragOverOrgId, selectedOrgId, selectOrg])

  const hasChildren = (childrenByOrgId.get(currentRootId)?.length ?? 0) > 0

  return (
    <OrgTreePanel
      panel={panel}
      panelViewMode={panelViewMode}
      canvasZoom={canvasZoom}
      isSelected={isSelected}
      windowKind="window"
      setPosition={setPosition}
      setPanelHeight={setPanelHeight}
      dragHandlersOuter={{
        onDragOver:  e => handleDragOver(e, currentRootId),
        onDragLeave: handleDragLeave,
        onDrop:      e => handleDrop(e, currentRootId),
        isDragOver,
      }}
      renderHeader={onHeaderMouseDown => (
        <TreeWindowHeader
          panel={panel}
          rootPath={rootPath}
          organizations={organizations}
          currentOrg={currentOrg}
          totalCount={totalCount}
          headerBg={headerBg}
          onToggleOpen={handleToggleOpen}
          onNavigateToIdx={navigateToIdx}
          onHeaderMouseDown={onHeaderMouseDown}
        />
      )}
      renderControls={() => (
        <OrgTreeControls
          hasChildren={hasChildren}
          ca={{
            panel, currentRootId, childrenByOrgId,
            hasItems: id => getItemCount(id) > 0,
            getPanelByOrgId: orgId => panels.find(p => p.orgId === orgId),
            setChildrenMode, setCollapsedOrgIds,
            openOrg:         orgId => setOrgOpen(orgId, true),
            closeOrg:        orgId => setOrgOpen(orgId, false),
            addPanel, removeOrgPanels,
            onSelectOrg: selectOrg,
          }}
        />
      )}
      renderBody={() => {
        if (!currentOrg) return <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
        // バンドモードでも OrgTreeNode を通す（inline/windowed の子展開を維持するため）
        // renderItems だけ renderFlatItems に差し替えることで各組織ノードがバンド表示になる
        const effectiveConfig = panelViewMode === 'band' && config.renderFlatItems
          ? { ...config, renderItems: config.renderFlatItems }
          : config
        return (
          <div className="p-1.5">
            <OrgTreeNode
              key={currentRootId}
              orgId={currentRootId}
              panelId={panel.id}
              config={effectiveConfig}
              adapter={adapter}
              collapsedOrgs={collapsedOrgs}
              onOrgCollapse={onOrgCollapse}
              onOrgExpand={onOrgExpand}
              onNavigate={navigateTo}
              isRoot
            />
          </div>
        )
      }}
    />
  )
}
