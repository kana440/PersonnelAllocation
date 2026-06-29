import { useState } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import type { OrgTreeConfig, PanelTreeAdapter } from './types'

const CHILD_COLLAPSE_THRESHOLD = 6
const CHILD_SHOW_COUNT = 5

function subtreeCount(orgId: string, childrenByOrgId: Map<string, Organization[]>, getItemCount: (id: string) => number): number {
  let n = getItemCount(orgId)
  for (const c of childrenByOrgId.get(orgId) ?? []) n += subtreeCount(c.id, childrenByOrgId, getItemCount)
  return n
}

interface Props {
  orgId:        string
  panelId:      string
  config:       OrgTreeConfig
  adapter:      PanelTreeAdapter
  collapsedOrgs?:  ReadonlySet<string>
  onOrgCollapse?:  (id: string) => void
  onOrgExpand?:    (id: string) => void
  onNavigate:   (orgId: string) => void
  isRoot?:      boolean
}

export function OrgTreeNode({ orgId, panelId, config, adapter, collapsedOrgs, onOrgCollapse, onOrgExpand, onNavigate, isRoot }: Props) {
  const { orgById, childrenByOrgId, getItemCount, renderItems, showEmptyOrgs, accentColor, dragHandlers, selectedOrgId, onSelectOrg } = config
  const [localCollapsed,  setLocalCollapsed]  = useState<Set<string>>(() => new Set())
  const [showAllChildren, setShowAllChildren] = useState(false)

  const org       = orgById.get(orgId)
  const itemCount = getItemCount(orgId)
  const allChildren = childrenByOrgId.get(orgId) ?? []
  const childOrgs = showEmptyOrgs
    ? allChildren
    : allChildren.filter(c => subtreeCount(c.id, childrenByOrgId, getItemCount) > 0)

  if (!org) return null
  if (!isRoot && itemCount === 0 && childOrgs.length === 0) return null

  const panel        = adapter.getPanelByOrgId(orgId)
  const childrenMode = panel ? adapter.getChildrenMode(panel.id) : 'inline'

  // ── 子組織セクション ─────────────────────────────────────────────
  const needsCollapse = childOrgs.length > CHILD_COLLAPSE_THRESHOLD
  const visibleChildren = needsCollapse && !showAllChildren ? childOrgs.slice(0, CHILD_SHOW_COUNT) : childOrgs
  const hiddenCount = childOrgs.length - visibleChildren.length

  const childSection = childOrgs.length > 0 && (
    <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
      {visibleChildren.map(child => {
        const childPanel = adapter.getPanelByOrgId(child.id)
        const isOpen     = childPanel?.open ?? false
        const count      = subtreeCount(child.id, childrenByOrgId, getItemCount)

        if (childrenMode === 'windowed') {
          if (isOpen) {
            return <ChildChip key={child.id} child={child} count={count} variant="windowed" accentColor={accentColor}
              onClick={() => { adapter.closeOrg(child.id); onSelectOrg?.(orgId) }}
              dragHandlers={dragHandlers} />
          }
          return <ChildChip key={child.id} child={child} count={count} variant="closed" accentColor={accentColor}
            onClick={() => {
              childPanel ? adapter.openOrg(child.id) : adapter.addPanel?.(child.id)
              onSelectOrg?.(child.id)
            }}
            dragHandlers={dragHandlers} />
        }

        // inline モード
        const collapsed   = collapsedOrgs ? collapsedOrgs.has(child.id) : localCollapsed.has(child.id)
        const childPanelId = childPanel?.id ?? panelId
        if (!collapsed) {
          return (
            <InlineOrgSection
              key={child.id}
              child={child}
              childPanelId={childPanelId}
              count={count}
              config={config}
              adapter={adapter}
              collapsedOrgs={collapsedOrgs}
              onOrgCollapse={onOrgCollapse}
              onOrgExpand={onOrgExpand}
              onNavigate={onNavigate}
              isSelected={selectedOrgId === child.id}
              onCollapse={() => {
                onOrgCollapse ? onOrgCollapse(child.id) : setLocalCollapsed(p => new Set([...p, child.id]))
                onSelectOrg?.(orgId)
              }}
            />
          )
        }
        return <ChildChip key={child.id} child={child} count={count} variant="closed" accentColor={accentColor}
          onClick={() => {
            onOrgExpand ? onOrgExpand(child.id) : setLocalCollapsed(p => { const s = new Set(p); s.delete(child.id); return s })
            onSelectOrg?.(child.id)
          }}
          dragHandlers={dragHandlers} />
      })}

      {needsCollapse && !showAllChildren && (
        <button onClick={() => setShowAllChildren(true)}
          className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <span className="text-[8px]">▶</span>他 {hiddenCount} 件（全 {childOrgs.length} 件）
        </button>
      )}
      {needsCollapse && showAllChildren && (
        <button onClick={() => setShowAllChildren(false)}
          className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <span className="text-[8px]">▲</span>折りたたむ
        </button>
      )}
    </div>
  )

  const body = (isRoot !== false) && (
    <div className={!isRoot ? 'pl-3 border-l border-gray-100 ml-2' : undefined}>
      {renderItems(orgId, panelId)}
      {childSection}
    </div>
  )

  if (isRoot) return <>{body}</>

  const hoverClass = accentColor === 'amber' ? 'hover:bg-amber-50/60' : 'hover:bg-gray-50'
  const iconHover  = accentColor === 'amber' ? 'group-hover:text-amber-400' : 'group-hover:text-blue-400'
  return (
    <div>
      <div className={`group flex items-center gap-1.5 px-1 py-0.5 rounded ${hoverClass} cursor-pointer`}
        onDoubleClick={e => { e.stopPropagation(); onNavigate(orgId) }}>
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{org.name}</span>
        <span className={`text-[9px] text-gray-300 ${iconHover} opacity-0 group-hover:opacity-100 flex-shrink-0`}>⤵</span>
      </div>
      {body}
    </div>
  )
}

// ── 子組織チップ ──────────────────────────────────────────────────────
function ChildChip({ child, count, variant, accentColor, onClick, dragHandlers }: {
  child:        Organization
  count:        number
  variant:      'closed' | 'windowed'
  accentColor:  'blue' | 'amber'
  onClick:      () => void
  dragHandlers?: import('./types').OrgDragHandlers
}) {
  const isWindowed = variant === 'windowed'
  const isDragOver = dragHandlers?.dragOverOrgId === child.id
  const ac = accentColor === 'amber'
    ? { open: 'border-amber-200 bg-amber-50/30', text: 'text-amber-700', icon: 'text-amber-400', arrow: 'text-amber-300' }
    : { open: 'border-blue-200 bg-blue-50/30',  text: 'text-blue-600',  icon: 'text-blue-400',  arrow: 'text-blue-300'  }

  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer hover:bg-gray-100 transition-colors
        ${isDragOver ? 'border-blue-300 bg-blue-50/40' : isWindowed ? ac.open : 'border-gray-200 bg-gray-50'}`}
      onClick={onClick}
      title={isWindowed ? 'クリックして折りたたむ' : 'クリックして展開'}
      onDragOver={dragHandlers ? e => { e.stopPropagation(); dragHandlers.handleDragOver(e, child.id) } : undefined}
      onDragLeave={dragHandlers?.handleDragLeave}
      onDrop={dragHandlers ? e => { e.stopPropagation(); dragHandlers.handleDrop(e, child.id) } : undefined}
    >
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? ac.icon : 'text-gray-300'}`}>{isWindowed ? '▼' : '▶'}</span>
      <span className={`flex-1 text-[10px] font-medium truncate min-w-0 ${isWindowed ? ac.text : 'text-gray-400'}`}>{child.name}</span>
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? ac.icon : 'text-gray-300'}`}>{count}名</span>
      {isWindowed && <span className={`text-[8px] flex-shrink-0 ml-0.5 ${ac.arrow}`}>↗</span>}
    </div>
  )
}

// ── インラインセクション ──────────────────────────────────────────────
function InlineOrgSection({ child, childPanelId, count, config, adapter, collapsedOrgs, onOrgCollapse, onOrgExpand, onNavigate, isSelected, onCollapse }: {
  child:         Organization
  childPanelId:  string
  count:         number
  config:        OrgTreeConfig
  adapter:       PanelTreeAdapter
  collapsedOrgs?: ReadonlySet<string>
  onOrgCollapse?: (id: string) => void
  onOrgExpand?:   (id: string) => void
  onNavigate:    (orgId: string) => void
  isSelected?:   boolean
  onCollapse:    () => void
}) {
  const { renderOrgExtra, dragHandlers } = config
  const isDragOver = dragHandlers?.dragOverOrgId === child.id
  const selectedStyle = isSelected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'

  return (
    <div
      data-orgsectionid={child.id}
      className={`rounded border transition-colors ${isDragOver ? 'border-blue-300 bg-blue-50/40' : selectedStyle}`}
      onDragOver={dragHandlers ? e => { e.stopPropagation(); dragHandlers.handleDragOver(e, child.id) } : undefined}
      onDragLeave={dragHandlers?.handleDragLeave}
      onDrop={dragHandlers ? e => { e.stopPropagation(); dragHandlers.handleDrop(e, child.id) } : undefined}
    >
      <div className={`flex items-center gap-1 px-1.5 py-0.5 cursor-pointer rounded-t transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
        onClick={onCollapse}>
        <span className={`text-[9px] flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-500'}`}>▼</span>
        <span className={`flex-1 text-[10px] font-medium truncate min-w-0 ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{child.name}</span>
        <span className={`text-[9px] flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>{count}名</span>
        {renderOrgExtra?.(child.id)}
      </div>
      <div className="px-1 pb-1">
        <OrgTreeNode orgId={child.id} panelId={childPanelId} config={config} adapter={adapter}
          collapsedOrgs={collapsedOrgs} onOrgCollapse={onOrgCollapse} onOrgExpand={onOrgExpand}
          onNavigate={onNavigate} isRoot />
      </div>
    </div>
  )
}
