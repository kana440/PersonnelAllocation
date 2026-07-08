import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Organization } from '@personnel/domain/schemas'
import { useBeforeOrgView }         from './BeforeOrgViewContext'
import { BeforeRowCard }            from './BeforeRowCard'
import { buildPositionDepthList }   from '../panel/helpers'
import { useStore }                 from '../../../store/useStore'
import { useCanvasLayoutStore }     from '../../../store/canvasLayoutStore'
import type { PanelDef }            from '../../../store/canvasLayoutStore'
import { useCanvasDisplayStore }    from '../../../store/canvasDisplayStore'
import { COMPACT_GROUP_DEFS, DEFAULT_COMPACT_GROUP_ID, sortGroupsByLineAndBand } from '../panel/compactGroupDefs'
import { OrgTreePanel }             from '../core/OrgTreePanel'
import { OrgTreeNode }              from '../core/OrgTreeNode'
import { OrgTreeControls }          from '../core/OrgTreeControls'
import type { OrgTreeConfig, PanelTreeAdapter } from '../core/types'

// memo: マーキー選択のドラッグ中などで親（BeforeTreeWindowCanvas）が頻繁に再レンダーされても、
// panel が変わらない限り再レンダーしない
export const BeforeTreeWindow = memo(function BeforeTreeWindow({ panel }: { panel: PanelDef }) {
  const {
    beforeOrganizations, beforeRowsByOrgId,
    childrenByOrgId, beforeSubtreeCountByOrgId,
  } = useBeforeOrgView()

  const compactGroupById = useCanvasDisplayStore(s => s.compactGroupById)
  const groupDef = COMPACT_GROUP_DEFS.find(d => d.id === compactGroupById)
    ?? COMPACT_GROUP_DEFS.find(d => d.id === DEFAULT_COMPACT_GROUP_ID)!

  const {
    setComparisonPosition, toggleComparisonPanelOpen,
    setComparisonChildrenMode, setComparisonOrgOpen,
    setComparisonCollapsedOrgIds, setPanelHeight,
    comparisonPanels, canvasPanelStyle,
  } = useCanvasLayoutStore(useShallow(s => ({
    setComparisonPosition:        s.setComparisonPosition,
    toggleComparisonPanelOpen:    s.toggleComparisonPanelOpen,
    setComparisonChildrenMode:    s.setComparisonChildrenMode,
    setComparisonOrgOpen:         s.setComparisonOrgOpen,
    setComparisonCollapsedOrgIds: s.setComparisonCollapsedOrgIds,
    setPanelHeight:               s.setPanelHeight,
    comparisonPanels:             s.comparisonPanels,
    canvasPanelStyle:                s.canvasPanelStyle,
  })))

  // orgById はウィンドウ内ナビゲーション（breadcrumb）に使うだけ。contextに入れるほどでもないのでローカルに保つ
  const orgById = useMemo(() => new Map(beforeOrganizations.map(o => [o.id, o])), [beforeOrganizations])

  // 組織選択（selectedOrgId は新旧共通の1フィールド。旧組織の id を入れても新側とは衝突しない）
  const selectedOrgId = useStore(s => s.selectedOrgId)
  const selectOrg     = useStore(s => s.selectOrg)

  const getItemCount = useCallback((id: string) => beforeRowsByOrgId.get(id)?.length ?? 0, [beforeRowsByOrgId])

  // ── ブレッドクラムナビゲーション ───────────────────────────────
  const [rootPath, setRootPath] = useState([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = orgById.get(currentRootId)
  const totalCount    = beforeSubtreeCountByOrgId.get(currentRootId) ?? 0

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

  // ── パネル O(1) ルックアップ Map ────────────────────────────────
  const comparisonPanelByOrgId = useMemo(() => new Map(comparisonPanels.map(p => [p.orgId, p])), [comparisonPanels])

  // ── PanelTreeAdapter（before 側: addPanel なし） ───────────────
  const adapter: PanelTreeAdapter = useMemo(() => ({
    getPanelByOrgId: (orgId) => comparisonPanelByOrgId.get(orgId),
    openOrg:         (orgId) => setComparisonOrgOpen(orgId, true),
    closeOrg:        (orgId) => setComparisonOrgOpen(orgId, false),
    // addPanel は before 側では不要（全パネルは初期化時に作成済み）
  }), [comparisonPanelByOrgId, setComparisonOrgOpen])

  // ── OrgTreeConfig ─────────────────────────────────────────────
  const config: OrgTreeConfig = useMemo(() => ({
    orgs: beforeOrganizations,
    orgById,
    childrenByOrgId,
    getItemCount,
    subtreeCountByOrgId: beforeSubtreeCountByOrgId,
    renderItems: (orgId) => {
      const rows      = beforeRowsByOrgId.get(orgId) ?? []
      const depthList = buildPositionDepthList(rows, r => r.prevPositionCode, r => r.prevManagerPositionCode)
      return depthList.map(({ row, depth }) => (
        <BeforeRowCard key={row.rowId} row={row} orgId={orgId} depth={depth} />
      ))
    },
    renderFlatItems: (orgId) => <BeforeGroupView orgId={orgId} beforeRowsByOrgId={beforeRowsByOrgId} groupDef={groupDef} />,
    getHeaderBg: () => '#5c5248',
    accentColor: 'amber',
    showEmptyOrgs: false,
  }), [beforeOrganizations, orgById, childrenByOrgId, getItemCount, beforeSubtreeCountByOrgId, beforeRowsByOrgId, groupDef])

  const hasChildren = (childrenByOrgId.get(currentRootId)?.length ?? 0) > 0

  return (
    <OrgTreePanel
      panel={panel}
      canvasPanelStyle={canvasPanelStyle}
      isSelected={selectedOrgId === panel.orgId}
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
          onSelectOrg={() => selectOrg(panel.orgId)}
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
            getPanelByOrgId: orgId => comparisonPanelByOrgId.get(orgId),
            setChildrenMode: setComparisonChildrenMode,
            setCollapsedOrgIds: setComparisonCollapsedOrgIds,
            openOrg:  orgId => setComparisonOrgOpen(orgId, true),
            closeOrg: orgId => setComparisonOrgOpen(orgId, false),
          }}
        />
      )}
      renderBody={() => {
        if (!currentOrg) return <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
        // バンドモードでも OrgTreeNode を通す（inline/windowed の子展開を維持するため。新側と同じ方針）。
        // renderItems だけ renderFlatItems に差し替えることで各組織ノードがバンド表示になる
        const effectiveConfig = canvasPanelStyle === 'band' && config.renderFlatItems
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
})

// ── before 側ヘッダー（amber テーマ） ────────────────────────────────
function BeforeTreeHeader({ panel, rootPath, orgById, currentOrg, totalCount, onHeaderMouseDown, onToggleOpen, onNavigateToIdx, onSelectOrg }: {
  panel:             PanelDef
  rootPath:          string[]
  orgById:           Map<string, Organization>
  currentOrg:        Organization | undefined
  totalCount:        number
  onHeaderMouseDown: (e: React.MouseEvent) => void
  onToggleOpen:      () => void
  onNavigateToIdx:   (idx: number) => void
  onSelectOrg:       () => void
}) {
  const headerBg = '#5c5248'
  return (
    <div
      onMouseDown={onHeaderMouseDown}
      onClick={onSelectOrg}
      className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
      style={{ background: headerBg, userSelect: 'none' }}
    >
      {/* 1行目: 組織コード + 人数 + 一つ上へ + 折りたたみ（新側 TreeWindowHeader と同じ2行構成） */}
      <div className="flex items-center gap-1 px-2 pt-1">
        <span className="text-[10px] text-stone-300 font-mono flex-1 truncate min-w-0">
          {currentOrg?.externalCode ?? panel.orgId}
        </span>
        <span className="text-[10px] text-stone-300 flex-shrink-0">({totalCount})</span>
        {rootPath.length > 1 && (
          <button onClick={() => onNavigateToIdx(rootPath.length - 2)}
            className="w-5 h-5 flex items-center justify-center text-[10px] text-stone-300 hover:text-white hover:bg-stone-600 rounded flex-shrink-0"
            title="一つ上へ">↑</button>
        )}
        <button onClick={e => { e.stopPropagation(); onToggleOpen() }}
          title={panel.open ? '折りたたむ' : '展開'}
          className="w-5 h-5 flex items-center justify-center text-white hover:bg-stone-600 text-xs transition-colors flex-shrink-0">
          {panel.open ? '─' : '▲'}
        </button>
      </div>
      {/* 2行目: 組織名（子組織に入っている場合はパンくず） */}
      <div className="flex items-center gap-0.5 px-2 pb-1 min-w-0 overflow-hidden">
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
          <span className="text-xs font-semibold text-white block truncate">{currentOrg?.name ?? panel.orgId}</span>
        )}
      </div>
    </div>
  )
}

// ── before 側グループビュー（コンパクト表示） ────────────────────────
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { CompactGroupDef } from '../panel/compactGroupDefs'

function BeforeGroupView({ orgId, beforeRowsByOrgId, groupDef }: {
  orgId:             string
  beforeRowsByOrgId: Map<string, AllocationRow[]>
  groupDef:          CompactGroupDef
}) {
  const rows               = beforeRowsByOrgId.get(orgId) ?? []
  const selectCard         = useStore(s => s.selectCard)
  const selectedCardRowId  = useStore(s => s.selectedCardRowId)
  const masters            = useStore(s => s.masters)
  const requestScrollToRow = useCanvasLayoutStore(s => s.requestScrollToRow)

  const getKey = groupDef.getPrevKey ?? groupDef.getKey

  const groups = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of rows) {
      if (!row.userId) continue
      const key = getKey(row)
      const arr = map.get(key)
      if (arr) arr.push(row)
      else map.set(key, [row])
    }
    // ライン長（このパネル組織内で自分より上の管理職がいないポジション。topPositionCodeOfOrg と同じ定義）
    const rowsWithPos      = rows.filter(r => !!r.positionCode)
    const posSet           = new Set(rowsWithPos.map(r => r.positionCode))
    const linePositionCode = rowsWithPos.find(r => !r.managerPositionCode || !posSet.has(r.managerPositionCode))?.positionCode as string | undefined
    const groupsForSort    = [...map.entries()].map(([key, items]) => ({ key, rows: items }))
    const sortedKeys       = sortGroupsByLineAndBand(groupsForSort, masters, linePositionCode)
    return sortedKeys.map(key => {
      const items = map.get(key)!
      const label = groupDef.formatGroupLabel && items.length > 0
        ? groupDef.formatGroupLabel(key, items[0], true)
        : key
      return { key, label, items }
    })
  }, [rows, getKey, masters, groupDef])

  if (groups.length === 0) return <p className="text-[10px] text-gray-400 text-center py-3">メンバーなし</p>

  return (
    <div className="p-1.5 space-y-1.5">
      {groups.map(({ key, label, items }) => (
        <div key={key}>
          <div className="text-[9px] font-semibold text-gray-400 tracking-wider mb-0.5 px-0.5 leading-tight whitespace-pre-line">{label}</div>
          <div className="flex flex-wrap gap-1">
            {items.map(row => {
              const name       = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || ''
              const isSelected = selectedCardRowId === row.rowId
              return (
                <div key={row.rowId} data-before-rowid={row.rowId}
                  onClick={() => { selectCard(row.rowId, 'before'); requestScrollToRow(row.rowId) }}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border border-l-2 cursor-pointer select-none transition-colors
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
