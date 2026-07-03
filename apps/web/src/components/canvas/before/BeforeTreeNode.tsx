import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useBeforeOrgView } from './BeforeOrgViewContext'
import { BeforeRowCard } from './BeforeRowCard'
import { buildPositionDepthList, subtreeRowCount, hasAnyRows } from '../panel/helpers'
import type { Organization } from '@personnel/domain/schemas'

interface Props {
  orgId:      string
  panelId:    string
  onNavigate: (orgId: string) => void
  isRoot?:    boolean
}

export function BeforeTreeNode({ orgId, panelId, onNavigate, isRoot }: Props) {
  const { beforeOrganizations, beforeRowsByOrgId } = useBeforeOrgView()
  const { comparisonPanels, setComparisonOrgOpen } = useCanvasLayoutStore(useShallow(s => ({
    comparisonPanels:     s.comparisonPanels,
    setComparisonOrgOpen: s.setComparisonOrgOpen,
  })))

  const panel        = comparisonPanels.find(p => p.id === panelId)
  const childrenMode = panel?.childrenMode ?? 'inline'

  const org       = beforeOrganizations.find(o => o.id === orgId)
  const rows      = beforeRowsByOrgId.get(orgId) ?? []
  const depthList = useMemo(
    () => buildPositionDepthList(rows, r => r.prevPositionCode, r => r.prevManagerPositionCode),
    [rows],
  )
  const hasRowsFn = (id: string) => beforeRowsByOrgId.has(id)
  const childOrgs = beforeOrganizations.filter(
    o => o.parentId === orgId && hasAnyRows(o.id, beforeOrganizations, hasRowsFn),
  )

  if (!org) return null
  if (!isRoot && rows.length === 0 && childOrgs.length === 0) return null

  let childSection: React.ReactNode = null

  if (childOrgs.length > 0) {
    childSection = (
      <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
        {childOrgs.map(child => {
          const childPanel = comparisonPanels.find(p => p.orgId === child.id)
          const isOpen     = childPanel?.open ?? false

          if (!isOpen) {
            const count = subtreeRowCount(child.id, beforeOrganizations, id => beforeRowsByOrgId.get(id)?.length ?? 0)
            return (
              <BeforeChildChip
                key={child.id}
                child={child}
                count={count}
                variant="closed"
                onClick={() => setComparisonOrgOpen(child.id, true)}
              />
            )
          }

          if (childrenMode === 'windowed') {
            const count = subtreeRowCount(child.id, beforeOrganizations, id => beforeRowsByOrgId.get(id)?.length ?? 0)
            return (
              <BeforeChildChip
                key={child.id}
                child={child}
                count={count}
                variant="windowed"
                onClick={() => setComparisonOrgOpen(child.id, false)}
              />
            )
          }

          const childPanelId = childPanel?.id ?? panelId
          return (
            <BeforeInlineSection
              key={child.id}
              child={child}
              childPanelId={childPanelId}
              onNavigate={onNavigate}
              onCollapse={() => setComparisonOrgOpen(child.id, false)}
            />
          )
        })}
      </div>
    )
  }

  const body = (
    <div className={!isRoot ? 'pl-3 border-l border-gray-100 ml-2' : undefined}>
      {depthList.map(({ row, depth }) => (
        <BeforeRowCard key={row.rowId} row={row} orgId={orgId} depth={depth} />
      ))}
      {childSection}
    </div>
  )

  if (isRoot) return <>{body}</>

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-amber-50/60 cursor-pointer"
        onDoubleClick={e => { e.stopPropagation(); onNavigate(orgId) }}
      >
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{org.name}</span>
        <span className="text-[9px] text-gray-300 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 flex-shrink-0">⤵</span>
      </div>
      {body}
    </div>
  )
}

// ── 子組織チップ ─────────────────────────────────────────────────────
function BeforeChildChip({
  child, count, variant, onClick,
}: {
  child:   Organization
  count:   number
  variant: 'closed' | 'windowed'
  onClick: () => void
}) {
  const isWindowed = variant === 'windowed'
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer hover:bg-amber-50/60 transition-colors
        ${isWindowed ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-gray-50'}`}
      onClick={onClick}
      title={isWindowed ? 'クリックして折りたたむ' : 'クリックして展開'}
    >
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? 'text-amber-400' : 'text-gray-300'}`}>
        {isWindowed ? '▼' : '▶'}
      </span>
      <span className={`flex-1 text-[10px] font-medium truncate min-w-0 ${isWindowed ? 'text-amber-700' : 'text-gray-400'}`}>
        {child.name}
      </span>
      <span className={`text-[9px] flex-shrink-0 ${isWindowed ? 'text-amber-400' : 'text-gray-300'}`}>
        {count}名
      </span>
      {isWindowed && <span className="text-[8px] text-amber-300 flex-shrink-0 ml-0.5">↗</span>}
    </div>
  )
}

// ── インラインセクション ──────────────────────────────────────────────
function BeforeInlineSection({
  child, childPanelId, onNavigate, onCollapse,
}: {
  child:        Organization
  childPanelId: string
  onNavigate:   (orgId: string) => void
  onCollapse:   () => void
}) {
  const { beforeOrganizations, beforeRowsByOrgId } = useBeforeOrgView()
  const count = subtreeRowCount(child.id, beforeOrganizations, id => beforeRowsByOrgId.get(id)?.length ?? 0)

  return (
    <div className="rounded border border-gray-200">
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer hover:bg-amber-50/60 rounded-t"
        onClick={onCollapse}
      >
        <span className="text-[9px] text-gray-500 flex-shrink-0">▼</span>
        <span className="flex-1 text-[10px] font-medium text-gray-700 truncate min-w-0">{child.name}</span>
        <span className="text-[9px] text-gray-400 flex-shrink-0">{count}名</span>
      </div>
      <div className="px-1 pb-1">
        <BeforeTreeNode orgId={child.id} panelId={childPanelId} onNavigate={onNavigate} isRoot />
      </div>
    </div>
  )
}
