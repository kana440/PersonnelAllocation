import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useOrgView }            from '../OrgViewContext'
import { subtreeRowCount }        from '../panel/helpers'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
import type { PanelDef }         from '../../../store/canvasLayoutStore'
import { TreeNode }              from './TreeNode'
import { TreeWindowHeader }      from './TreeWindowHeader'
import { TreeWindowControls }    from './TreeWindowControls'
import { BandMatrixPanel }       from '../panel/BandMatrixPanel'
import { useStore }              from '../../../store/useStore'
import { isSecondmentOrg }       from '@personnel/domain/derivation'

interface TreeWindowProps {
  panel:       PanelDef
  isSelected?: boolean
}

export function TreeWindow({ panel, isSelected = false }: TreeWindowProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const { toggleOpen, setCollapsedOrgIds, setPanelHeight, panelViewMode } = useCanvasLayoutStore()
  const masters   = useStore(s => s.masters)
  const selectOrg = useStore(s => s.selectOrg)

  // ── ヘッダー色 ──────────────────────────────────────────────────
  const org = organizations.find(o => o.id === panel.orgId)
  const hasRows      = subtreeRowCount(panel.orgId, organizations, id => positionTreeByOrgId.get(id)?.length ?? 0) > 0
  const isSecondment = org?.externalCode ? isSecondmentOrg(org.externalCode, masters) : false
  const headerBg     = isSecondment ? '#2e7d52' : !hasRows ? '#b54520' : '#3c7abf'

  // ── ナビゲーション（パネル内 D&D ドリルダウン）──────────────────
  const [rootPath, setRootPath] = useState<string[]>([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]

  const navigateTo = useCallback((childOrgId: string) => {
    setRootPath(prev => [...prev, childOrgId])
    setCollapsedOrgIds(panel.id, [])
  }, [panel.id, setCollapsedOrgIds])

  const navigateToIdx = useCallback((idx: number) => {
    setRootPath(prev => prev.slice(0, idx + 1))
    setCollapsedOrgIds(panel.id, [])
  }, [panel.id, setCollapsedOrgIds])

  // ── リストモード: 折りたたみ状態 ────────────────────────────────
  const collapsedOrgs = useMemo(() => new Set(panel.collapsedOrgIds), [panel.collapsedOrgIds])

  const onOrgCollapse = useCallback((id: string) => {
    setCollapsedOrgIds(panel.id, [...panel.collapsedOrgIds, id])
  }, [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds])

  const onOrgExpand = useCallback((id: string) => {
    setCollapsedOrgIds(panel.id, panel.collapsedOrgIds.filter(x => x !== id))
  }, [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds])

  // ── 開閉トグル ───────────────────────────────────────────────────
  const handleToggleOpen = useCallback(() => {
    const nextOpen = !panel.open
    toggleOpen(panel.id)
    if (nextOpen) {
      selectOrg(panel.orgId)
    } else {
      const parentOrgId = organizations.find(o => o.id === panel.orgId)?.parentId
      selectOrg(parentOrgId ?? panel.orgId)
    }
  }, [panel, toggleOpen, selectOrg, organizations])

  const currentOrg = organizations.find(o => o.id === currentRootId)
  const totalCount = subtreeRowCount(currentRootId, organizations, id => positionTreeByOrgId.get(id)?.length ?? 0)
  const isDragOver = dragOverOrgId === currentRootId

  // ── ResizeObserver でパネル実測高さをストアへ通知 ────────────────
  const panelDivRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = panelDivRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { setPanelHeight(panel.id, el.offsetHeight) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [panel.id, setPanelHeight])

  return (
    <div
      ref={panelDivRef}
      data-window="true"
      data-panelid={panel.id}
      className={`flex flex-col rounded shadow-lg border transition-colors select-none overflow-hidden
        ${isDragOver ? 'border-blue-400' : isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-400'}`}
      style={{ background: '#ffffff', width: panelViewMode === 'band' ? 208 : 288, maxHeight: 'calc(100vh - 80px)' }}
      onDragOver={e => handleDragOver(e, currentRootId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, currentRootId)}
    >
      <TreeWindowHeader
        panel={panel}
        rootPath={rootPath}
        organizations={organizations}
        currentOrg={currentOrg}
        totalCount={totalCount}
        headerBg={headerBg}
        onToggleOpen={handleToggleOpen}
        onNavigateToIdx={navigateToIdx}
      />

      <TreeWindowControls panel={panel} currentRootId={currentRootId} />

      {panel.open && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!currentOrg ? (
            <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
          ) : panelViewMode === 'band' ? (
            <BandMatrixPanel orgId={currentRootId} panelId={panel.id} />
          ) : (
            <div className="p-1.5">
              <TreeNode
                key={currentRootId}
                orgId={currentRootId}
                panelId={panel.id}
                onNavigate={navigateTo}
                isRoot
                collapsedOrgs={collapsedOrgs}
                onOrgCollapse={onOrgCollapse}
                onOrgExpand={onOrgExpand}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
