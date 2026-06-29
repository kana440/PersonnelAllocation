import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import { useBeforeOrgView }         from './BeforeOrgViewContext'
import { BeforeRowCard }            from './BeforeRowCard'
import { buildPositionDepthList }   from '../panel/helpers'
import { useCanvasLayoutStore }     from '../../../store/canvasLayoutStore'
import type { PanelDef }            from '../../../store/canvasLayoutStore'
import { OrgTreePanel }             from '../core/OrgTreePanel'
import { OrgTreeNode }              from '../core/OrgTreeNode'
import { OrgTreeControls }          from '../core/OrgTreeControls'
import type { OrgTreeConfig, PanelTreeAdapter } from '../core/types'

function subtreeSize(orgId: string, childrenByOrgId: Map<string, Organization[]>, getCount: (id: string) => number): number {
  let n = getCount(orgId)
  for (const c of childrenByOrgId.get(orgId) ?? []) n += subtreeSize(c.id, childrenByOrgId, getCount)
  return n
}

export function BeforeTreeWindow({ panel }: { panel: PanelDef }) {
  const { beforeOrganizations, beforeRowsByOrgId } = useBeforeOrgView()

  const {
    setComparisonPosition, toggleComparisonPanelOpen,
    setComparisonChildrenMode, setComparisonOrgOpen,
    setComparisonCollapsedOrgIds, setPanelHeight,
    comparisonPanels, panelViewMode, canvasZoom,
  } = useCanvasLayoutStore()

  // ── O(1) ルックアップ Map ─────────────────────────────────────────
  const orgById = useMemo(() => new Map(beforeOrganizations.map(o => [o.id, o])), [beforeOrganizations])
  const childrenByOrgId = useMemo(() => {
    const m = new Map<string, Organization[]>()
    for (const o of beforeOrganizations) {
      if (!o.parentId) continue
      const arr = m.get(o.parentId)
      if (arr) arr.push(o)
      else m.set(o.parentId, [o])
    }
    return m
  }, [beforeOrganizations])

  const getItemCount = useCallback((id: string) => beforeRowsByOrgId.get(id)?.length ?? 0, [beforeRowsByOrgId])

  // ── ブレッドクラムナビゲーション ───────────────────────────────
  const [rootPath, setRootPath] = useState([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = orgById.get(currentRootId)
  const totalCount    = subtreeSize(currentRootId, childrenByOrgId, getItemCount)

  const navigateTo    = useCallback((childOrgId: string) => {
    setRootPath(prev => [...prev, childOrgId])
    setComparisonCollapsedOrgIds(panel.id, [])
  }, [panel.id, setComparisonCollapsedOrgIds])

  const navigateToIdx = useCallback((idx: number) => {
    setRootPath(prev => prev.slice(0, idx + 1))
    setComparisonCollapsedOrgIds(panel.id, [])
  }, [panel.id, setComparisonCollapsedOrgIds])

  // ── 折りたたみ状態 ───────────────────────────────────────────────
  const collapsedOrgs = useMemo(() => new Set(panel.collapsedOrgIds), [panel.collapsedOrgIds])
  const onOrgCollapse = useCallback((id: string) =>
    setComparisonCollapsedOrgIds(panel.id, [...panel.collapsedOrgIds, id]),
    [panel.id, panel.collapsedOrgIds, setComparisonCollapsedOrgIds],
  )
  const onOrgExpand = useCallback((id: string) =>
    setComparisonCollapsedOrgIds(panel.id, panel.collapsedOrgIds.filter(x => x !== id)),
    [panel.id, panel.collapsedOrgIds, setComparisonCollapsedOrgIds],
  )

  // ── PanelTreeAdapter（before 側: addPanel なし） ───────────────
  const adapter: PanelTreeAdapter = useMemo(() => ({
    getPanelByOrgId: (orgId) => comparisonPanels.find(p => p.orgId === orgId),
    getChildrenMode: (panelId) => comparisonPanels.find(p => p.id === panelId)?.childrenMode ?? 'inline',
    openOrg:         (orgId) => setComparisonOrgOpen(orgId, true),
    closeOrg:        (orgId) => setComparisonOrgOpen(orgId, false),
    // addPanel は before 側では不要（全パネルは初期化時に作成済み）
  }), [comparisonPanels, setComparisonOrgOpen])

  // ── OrgTreeConfig ─────────────────────────────────────────────
  const config: OrgTreeConfig = useMemo(() => ({
    orgs: beforeOrganizations,
    orgById,
    childrenByOrgId,
    getItemCount,
    renderItems: (orgId) => {
      const rows      = beforeRowsByOrgId.get(orgId) ?? []
      const depthList = buildPositionDepthList(rows, r => r.prevPositionCode, r => r.prevManagerPositionCode)
      return depthList.map(({ row, depth }) => (
        <BeforeRowCard key={row.rowId} row={row} orgId={orgId} depth={depth} />
      ))
    },
    getHeaderBg: () => '#5c5248',
    accentColor: 'amber',
    showEmptyOrgs: false,
  }), [beforeOrganizations, orgById, childrenByOrgId, getItemCount, beforeRowsByOrgId])

  const hasChildren = (childrenByOrgId.get(currentRootId)?.length ?? 0) > 0

  return (
    <OrgTreePanel
      panel={panel}
      panelViewMode={panelViewMode}
      canvasZoom={canvasZoom}
      windowKind="before-window"
      setPosition={setComparisonPosition}
      setPanelHeight={setPanelHeight}
      renderHeader={onHeaderMouseDown => (
        <BeforeTreeHeader
          panel={panel}
          rootPath={rootPath}
          orgById={orgById}
          currentOrg={currentOrg}
          totalCount={totalCount}
          onHeaderMouseDown={onHeaderMouseDown}
          onToggleOpen={() => toggleComparisonPanelOpen(panel.id)}
          onNavigateToIdx={navigateToIdx}
        />
      )}
      renderControls={() => (
        <OrgTreeControls
          hasChildren={hasChildren}
          ca={{
            panel, currentRootId, childrenByOrgId,
            hasItems: id => getItemCount(id) > 0,
            getPanelByOrgId: orgId => comparisonPanels.find(p => p.orgId === orgId),
            setChildrenMode: setComparisonChildrenMode,
            setCollapsedOrgIds: setComparisonCollapsedOrgIds,
            openOrg:  orgId => setComparisonOrgOpen(orgId, true),
            closeOrg: orgId => setComparisonOrgOpen(orgId, false),
          }}
        />
      )}
      renderBody={() => {
        if (!currentOrg) return <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
        if (panelViewMode === 'band') return <BeforeBandView orgId={currentRootId} beforeRowsByOrgId={beforeRowsByOrgId} />
        return (
          <div className="p-1.5">
            <OrgTreeNode
              key={currentRootId}
              orgId={currentRootId}
              panelId={panel.id}
              config={config}
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

// ── before 側ヘッダー（amber テーマ） ────────────────────────────────
function BeforeTreeHeader({ panel, rootPath, orgById, currentOrg, totalCount, onHeaderMouseDown, onToggleOpen, onNavigateToIdx }: {
  panel:             PanelDef
  rootPath:          string[]
  orgById:           Map<string, Organization>
  currentOrg:        Organization | undefined
  totalCount:        number
  onHeaderMouseDown: (e: React.MouseEvent) => void
  onToggleOpen:      () => void
  onNavigateToIdx:   (idx: number) => void
}) {
  const headerBg = '#5c5248'
  return (
    <div
      onMouseDown={onHeaderMouseDown}
      className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
      style={{ background: headerBg, userSelect: 'none' }}
    >
      <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
        <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
          {rootPath.length > 1 ? (
            rootPath.map((id, i) => {
              const o      = orgById.get(id)
              const isLast = i === rootPath.length - 1
              return (
                <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                  {i > 0 && <span className="text-stone-400 text-[9px]">/</span>}
                  <button
                    onClick={() => onNavigateToIdx(i)}
                    className={`text-[10px] max-w-[5rem] truncate ${
                      isLast ? 'font-semibold text-white cursor-default' : 'text-stone-300 hover:text-white'
                    }`}
                  >{o?.name ?? id}</button>
                </span>
              )
            })
          ) : (
            <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? panel.orgId}</span>
          )}
          <span className="text-[10px] text-stone-300 flex-shrink-0 ml-0.5">({totalCount})</span>
        </div>
        <div className="flex items-center flex-shrink-0">
          {rootPath.length > 1 && (
            <button onClick={() => onNavigateToIdx(rootPath.length - 2)}
              className="w-5 h-5 flex items-center justify-center text-[10px] text-stone-300 hover:text-white hover:bg-stone-600 rounded"
              title="一つ上へ">↑</button>
          )}
          <button onClick={e => { e.stopPropagation(); onToggleOpen() }}
            title={panel.open ? '折りたたむ' : '展開'}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-stone-600 text-xs transition-colors">
            {panel.open ? '─' : '▲'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── before 側バンドビュー ─────────────────────────────────────────────
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useStore }           from '../../../store/useStore'

function BeforeBandView({ orgId, beforeRowsByOrgId }: {
  orgId:             string
  beforeRowsByOrgId: Map<string, AllocationRow[]>
}) {
  const rows              = beforeRowsByOrgId.get(orgId) ?? []
  const selectCard        = useStore(s => s.selectCard)
  const selectedCardRowId = useStore(s => s.selectedCardRowId)
  const masters           = useStore(s => s.masters)
  const { requestScrollToRow } = useCanvasLayoutStore()

  const bandGroups = useMemo(() => {
    const groups = new Map<string, AllocationRow[]>()
    for (const row of rows) {
      if (!row.userId) continue
      const band = (row.positionBand as string | undefined) ?? '(未設定)'
      const arr  = groups.get(band)
      if (arr) arr.push(row)
      else groups.set(band, [row])
    }
    return [...groups.entries()]
      .sort(([bandA], [bandB]) => {
        const lvA = masters.jobLevels.find((e: { label: string; promotionDemotionWarningLevel: number }) => e.label === bandA)?.promotionDemotionWarningLevel ?? -1
        const lvB = masters.jobLevels.find((e: { label: string; promotionDemotionWarningLevel: number }) => e.label === bandB)?.promotionDemotionWarningLevel ?? -1
        return lvB - lvA
      })
      .map(([band, items]) => ({ band, items }))
  }, [rows, masters.jobLevels])

  if (bandGroups.length === 0) return <p className="text-[10px] text-gray-400 text-center py-3">メンバーなし</p>

  return (
    <div className="p-1.5 space-y-1.5">
      {bandGroups.map(({ band, items }) => (
        <div key={band}>
          <div className="text-[9px] font-semibold text-gray-400 tracking-wider mb-0.5 px-0.5 leading-none">{band}</div>
          <div className="flex flex-wrap gap-1">
            {items.map(row => {
              const name       = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || ''
              const isSelected = selectedCardRowId === row.rowId
              return (
                <div key={row.rowId} data-before-rowid={row.rowId}
                  onClick={() => { selectCard(row.rowId, 'before'); requestScrollToRow(row.rowId) }}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border-l-2 cursor-pointer select-none transition-colors
                    ${isSelected
                      ? 'border-yellow-400 bg-yellow-50 text-stone-800 ring-1 ring-yellow-300'
                      : 'border-stone-400 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}>
                  {name}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
