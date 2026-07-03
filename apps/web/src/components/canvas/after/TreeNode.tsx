import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOrgView }           from '../OrgViewContext'
import { subtreeRowCount } from '../panel/helpers'
import { RowCard }              from '../panel/RowCard'
import { AddRowDropdown }       from '../AddRowDropdown'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import type { Organization }    from '@personnel/domain/schemas'

interface TreeNodeProps {
  orgId:      string
  /** このノードが属するパネルの ID（RowCard の D&D・選択スコープに使用） */
  panelId:    string
  onNavigate: (orgId: string) => void
  isRoot?:    boolean
  /**
   * リストモード用: 明示的に折りたたまれた組織 ID のセット。
   * TreeWindow から渡す。未提供時はローカル state にフォールバック。
   * デフォルト展開なので、このセットに入っているものだけチップ表示になる。
   */
  collapsedOrgs?:   ReadonlySet<string>
  onOrgCollapse?:   (id: string) => void   // ヘッダークリック → 折りたたむ
  onOrgExpand?:     (id: string) => void   // チップクリック   → 展開
}

/** 子組織がこの件数を超えたら折りたたむ */
const CHILD_COLLAPSE_THRESHOLD = 6
/** 折りたたみ時に表示する件数 */
const CHILD_SHOW_COUNT = 5

export function TreeNode({
  orgId, panelId, onNavigate, isRoot,
  collapsedOrgs, onOrgCollapse, onOrgExpand,
}: TreeNodeProps) {
  const { orgById, childrenByOrgId, positionTreeByOrgId } = useOrgView()
  const { panels, setOrgOpen, addPanel } = useCanvasLayoutStore(useShallow(s => ({
    panels:    s.panels,
    setOrgOpen: s.setOrgOpen,
    addPanel:   s.addPanel,
  })))
  const selectedOrgId = useStore(s => s.selectedOrgId)
  const selectOrg     = useStore(s => s.selectOrg)

  // TreeWindow から collapsedOrgs が渡されない場合のローカルフォールバック
  // （空セット = 全部デフォルト展開）
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(() => new Set())
  // 子組織リストの「もっと見る」状態
  const [showAllChildren, setShowAllChildren] = useState(false)

  const panel        = panels.find(p => p.id === panelId)
  const childrenMode = panel?.childrenMode ?? 'inline'

  const entries   = positionTreeByOrgId.get(orgId) ?? []
  // 行がなくても子組織は表示する（空のままドロップ先として使えるように）
  const childOrgs = childrenByOrgId.get(orgId) ?? []
  const org = orgById.get(orgId)

  if (!org) return null
  if (!isRoot && entries.length === 0 && childOrgs.length === 0) return null

  // ── 子組織セクション ────────────────────────────────────────────
  let childSection: React.ReactNode = null

  if (childOrgs.length > 0) {
    if (childrenMode === 'windowed') {
      // ── 展開（windowed）モード ──────────────────────────────
      // 展開済み（青）は常に先頭に表示。折りたたみは閉じた子だけに適用。
      const openChildren   = childOrgs.filter(c => panels.find(p => p.orgId === c.id)?.open ?? false)
      const closedChildren = childOrgs.filter(c => !(panels.find(p => p.orgId === c.id)?.open ?? false))
      const needsCollapse  = closedChildren.length > CHILD_COLLAPSE_THRESHOLD
      const visibleClosed  = needsCollapse && !showAllChildren
        ? closedChildren.slice(0, CHILD_SHOW_COUNT)
        : closedChildren
      const hiddenCount    = closedChildren.length - visibleClosed.length

      childSection = (
        <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
          {openChildren.map(child => {
            const count = subtreeRowCount(child.id, childrenByOrgId, id => positionTreeByOrgId.get(id)?.length ?? 0)
            return (
              <ChildChip
                key={child.id}
                child={child}
                count={count}
                variant="windowed"
                onClick={() => { setOrgOpen(child.id, false); selectOrg(orgId) }}
              />
            )
          })}
          {visibleClosed.map(child => {
            const childPanel = panels.find(p => p.orgId === child.id)
            const count = subtreeRowCount(child.id, childrenByOrgId, id => positionTreeByOrgId.get(id)?.length ?? 0)
            return (
              <ChildChip
                key={child.id}
                child={child}
                count={count}
                variant="closed"
                onClick={() => { childPanel ? setOrgOpen(child.id, true) : addPanel(child.id); selectOrg(child.id) }}
              />
            )
          })}
          {needsCollapse && !showAllChildren && (
            <button
              onClick={() => setShowAllChildren(true)}
              className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="text-[8px]">▶</span>
              他 {hiddenCount} 件（全 {closedChildren.length} 件）
            </button>
          )}
          {needsCollapse && showAllChildren && (
            <button
              onClick={() => setShowAllChildren(false)}
              className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="text-[8px]">▲</span>
              折りたたむ
            </button>
          )}
        </div>
      )
    } else {
      // ── リスト（inline）モード ──────────────────────────────
      // デフォルト展開。collapsedOrgs に入っているものだけチップ。
      const needsCollapse   = childOrgs.length > CHILD_COLLAPSE_THRESHOLD
      const visibleChildren = needsCollapse && !showAllChildren
        ? childOrgs.slice(0, CHILD_SHOW_COUNT)
        : childOrgs
      const hiddenCount = childOrgs.length - visibleChildren.length

      childSection = (
        <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
          {visibleChildren.map(child => {
            const childPanel   = panels.find(p => p.orgId === child.id)
            const collapsed    = collapsedOrgs ? collapsedOrgs.has(child.id) : localCollapsed.has(child.id)
            const isInlineOpen = !collapsed
            const childPanelId = childPanel?.id ?? panelId

            if (isInlineOpen) {
              return (
                <InlineOrgSection
                  key={child.id}
                  child={child}
                  childPanelId={childPanelId}
                  onNavigate={onNavigate}
                  onCollapse={() => {
                    if (onOrgCollapse) onOrgCollapse(child.id)
                    else setLocalCollapsed(prev => new Set([...prev, child.id]))
                    selectOrg(orgId)
                  }}
                  isSelected={selectedOrgId === child.id}
                  collapsedOrgs={collapsedOrgs}
                  onOrgCollapse={onOrgCollapse}
                  onOrgExpand={onOrgExpand}
                />
              )
            }

            const count = subtreeRowCount(child.id, childrenByOrgId, id => positionTreeByOrgId.get(id)?.length ?? 0)
            return (
              <ChildChip
                key={child.id}
                child={child}
                count={count}
                variant="closed"
                onClick={() => {
                  if (onOrgExpand) onOrgExpand(child.id)
                  else setLocalCollapsed(prev => { const s = new Set(prev); s.delete(child.id); return s })
                  selectOrg(child.id)
                }}
              />
            )
          })}
          {needsCollapse && !showAllChildren && (
            <button
              onClick={() => setShowAllChildren(true)}
              className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="text-[8px]">▶</span>
              他 {hiddenCount} 件（全 {childOrgs.length} 件）
            </button>
          )}
          {needsCollapse && showAllChildren && (
            <button
              onClick={() => setShowAllChildren(false)}
              className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="text-[8px]">▲</span>
              折りたたむ
            </button>
          )}
        </div>
      )
    }
  }

  const body = (isRoot !== false) && (
    <div className={!isRoot ? 'pl-3 border-l border-gray-100 ml-2' : undefined}>
      {entries.map(entry => (
        <RowCard key={entry.row.rowId} entry={entry} orgId={orgId} panelId={panelId} />
      ))}
      {childSection}
    </div>
  )

  if (isRoot) return <>{body}</>

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer"
        onDoubleClick={e => { e.stopPropagation(); onNavigate(orgId) }}
      >
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{org.name}</span>
        <span className="text-[9px] text-gray-300 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 flex-shrink-0">⤵</span>
      </div>
      {body}
    </div>
  )
}

// ── グレーチップ（閉じている / 展開中インジケータ） ─────────────────
function ChildChip({
  child, count, variant, onClick,
}: {
  child:   Organization
  count:   number
  variant: 'closed' | 'windowed'
  onClick: () => void
}) {
  const {
    handleDragOver, handleDragLeave, handleDrop, dragOverOrgId,
  } = useOrgView()
  const isDragOver = dragOverOrgId === child.id

  const isWindowed = variant === 'windowed'
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer hover:bg-gray-100 transition-colors
        ${isDragOver ? 'border-blue-300 bg-blue-50/40' : isWindowed ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50'}`}
      onClick={onClick}
      title={isWindowed ? 'クリックして折りたたむ' : 'クリックして展開'}
      onDragOver={e => { e.stopPropagation(); handleDragOver(e, child.id) }}
      onDragLeave={handleDragLeave}
      onDrop={e => { e.stopPropagation(); handleDrop(e, child.id) }}
    >
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? 'text-blue-400' : 'text-gray-300'}`}>
        {isWindowed ? '▼' : '▶'}
      </span>
      <span className={`flex-1 text-[10px] font-medium truncate min-w-0 ${isWindowed ? 'text-blue-600' : 'text-gray-400'}`}>
        {child.name}
      </span>
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? 'text-blue-400' : 'text-gray-300'}`}>
        {count}名
      </span>
      {isWindowed && (
        <span className="text-[8px] text-blue-300 flex-shrink-0 ml-0.5">↗</span>
      )}
    </div>
  )
}

// ── リストモード用: インライン展開セクション ─────────────────────────
function InlineOrgSection({
  child, childPanelId, onNavigate, onCollapse,
  isSelected, collapsedOrgs, onOrgCollapse, onOrgExpand,
}: {
  child:         Organization
  childPanelId:  string
  onNavigate:    (orgId: string) => void
  onCollapse:    () => void
  isSelected?:   boolean
  collapsedOrgs?: ReadonlySet<string>
  onOrgCollapse?: (id: string) => void
  onOrgExpand?:   (id: string) => void
}) {
  const {
    childrenByOrgId, positionTreeByOrgId,
    handleDragOver, handleDragLeave, handleDrop, dragOverOrgId,
  } = useOrgView()
  const count      = subtreeRowCount(child.id, childrenByOrgId, id => positionTreeByOrgId.get(id)?.length ?? 0)
  const isDragOver = dragOverOrgId === child.id

  return (
    <div
      data-orgsectionid={child.id}
      className={`rounded border transition-colors ${
        isDragOver    ? 'border-blue-300 bg-blue-50/40' :
        isSelected    ? 'border-blue-400 ring-1 ring-blue-200' :
        'border-gray-200'
      }`}
      onDragOver={e => { e.stopPropagation(); handleDragOver(e, child.id) }}
      onDragLeave={handleDragLeave}
      onDrop={e => { e.stopPropagation(); handleDrop(e, child.id) }}
    >
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 cursor-pointer rounded-t transition-colors ${
          isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
        }`}
        onClick={onCollapse}
      >
        <span className={`text-[9px] flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-500'}`}>▼</span>
        <span className={`flex-1 text-[10px] font-medium truncate min-w-0 ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{child.name}</span>
        <span className={`text-[9px] flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>{count}名</span>
        <AddRowDropdown orgCode={child.externalCode ?? ''} variant="inline" />
      </div>
      <div className="px-1 pb-1">
        <TreeNode
          orgId={child.id}
          panelId={childPanelId}
          onNavigate={onNavigate}
          isRoot
          collapsedOrgs={collapsedOrgs}
          onOrgCollapse={onOrgCollapse}
          onOrgExpand={onOrgExpand}
        />
      </div>
    </div>
  )
}
