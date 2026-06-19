import { useState } from 'react'
import { useOrgView }           from '../OrgViewContext'
import { subtreeRowCount, hasAnyRows } from '../panel/helpers'
import { RowCard }              from '../panel/RowCard'
import { AddRowDropdown }       from '../AddRowDropdown'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
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

export function TreeNode({
  orgId, panelId, onNavigate, isRoot,
  collapsedOrgs, onOrgCollapse, onOrgExpand,
}: TreeNodeProps) {
  const { organizations, positionTreeByOrgId } = useOrgView()
  const { panels, setOrgOpen, addPanel } = useCanvasLayoutStore()

  // TreeWindow から collapsedOrgs が渡されない場合のローカルフォールバック
  // （空セット = 全部デフォルト展開）
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(() => new Set())

  const panel        = panels.find(p => p.id === panelId)
  const childrenMode = panel?.childrenMode ?? 'inline'

  const entries   = positionTreeByOrgId.get(orgId) ?? []
  const childOrgs = organizations.filter(
    o => o.parentId === orgId && hasAnyRows(o.id, organizations, positionTreeByOrgId),
  )
  const org = organizations.find(o => o.id === orgId)

  if (!org) return null
  if (!isRoot && entries.length === 0 && childOrgs.length === 0) return null

  // ── 子組織セクション ────────────────────────────────────────────
  let childSection: React.ReactNode = null

  if (childOrgs.length > 0) {
    childSection = (
      <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
        {childOrgs.map(child => {
          const childPanel = panels.find(p => p.orgId === child.id)
          const isOpen     = childPanel?.open ?? false

          // ── 展開（windowed）モード ──────────────────────────────
          if (childrenMode === 'windowed') {
            if (isOpen) {
              const count = subtreeRowCount(child.id, organizations, positionTreeByOrgId)
              return (
                <ChildChip
                  key={child.id}
                  child={child}
                  count={count}
                  variant="windowed"
                  onClick={() => setOrgOpen(child.id, false)}
                />
              )
            }
            const count = subtreeRowCount(child.id, organizations, positionTreeByOrgId)
            return (
              <ChildChip
                key={child.id}
                child={child}
                count={count}
                variant="closed"
                onClick={() => childPanel ? setOrgOpen(child.id, true) : addPanel(child.id)}
              />
            )
          }

          // ── リスト（inline）モード ──────────────────────────────
          // デフォルト展開。collapsedOrgs に入っているものだけチップ。
          const collapsed = collapsedOrgs
            ? collapsedOrgs.has(child.id)
            : localCollapsed.has(child.id)
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
                }}
                collapsedOrgs={collapsedOrgs}
                onOrgCollapse={onOrgCollapse}
                onOrgExpand={onOrgExpand}
              />
            )
          }

          const count = subtreeRowCount(child.id, organizations, positionTreeByOrgId)
          return (
            <ChildChip
              key={child.id}
              child={child}
              count={count}
              variant="closed"
              onClick={() => {
                if (onOrgExpand) onOrgExpand(child.id)
                else setLocalCollapsed(prev => { const s = new Set(prev); s.delete(child.id); return s })
              }}
            />
          )
        })}
      </div>
    )
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
  collapsedOrgs, onOrgCollapse, onOrgExpand,
}: {
  child:         Organization
  childPanelId:  string
  onNavigate:    (orgId: string) => void
  onCollapse:    () => void
  collapsedOrgs?: ReadonlySet<string>
  onOrgCollapse?: (id: string) => void
  onOrgExpand?:   (id: string) => void
}) {
  const {
    organizations, positionTreeByOrgId,
    handleDragOver, handleDragLeave, handleDrop, dragOverOrgId,
  } = useOrgView()
  const count      = subtreeRowCount(child.id, organizations, positionTreeByOrgId)
  const isDragOver = dragOverOrgId === child.id

  return (
    <div
      className={`rounded border transition-colors ${isDragOver ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}
      onDragOver={e => { e.stopPropagation(); handleDragOver(e, child.id) }}
      onDragLeave={handleDragLeave}
      onDrop={e => { e.stopPropagation(); handleDrop(e, child.id) }}
    >
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer hover:bg-gray-50 rounded-t"
        onClick={onCollapse}
      >
        <span className="text-[9px] text-gray-500 flex-shrink-0">▼</span>
        <span className="flex-1 text-[10px] font-medium text-gray-700 truncate min-w-0">{child.name}</span>
        <span className="text-[9px] text-gray-400 flex-shrink-0">{count}名</span>
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
