import { useOrgView }           from '../OrgViewContext'
import { subtreeRowCount, hasAnyRows } from '../panel/helpers'
import { RowCard }              from '../panel/RowCard'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import type { Organization }    from '@personnel/domain/schemas'

interface TreeNodeProps {
  orgId:      string
  /** このノードが属するパネルの ID（RowCard の D&D・選択スコープに使用） */
  panelId:    string
  onNavigate: (orgId: string) => void
  isRoot?:    boolean
}

export function TreeNode({ orgId, panelId, onNavigate, isRoot }: TreeNodeProps) {
  const { organizations, positionTreeByOrgId } = useOrgView()
  const { panels, setOrgOpen, addPanel } = useCanvasLayoutStore()

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

          if (!isOpen) {
            // 閉じている: グレーチップ（クリックで開く。パネルがない場合は新規作成）
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

          if (childrenMode === 'windowed') {
            // 展開モード: 子は別ウィンドウ → 「外に展開中」インジケータ
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

          // リストモード: 子をインラインセクションとして表示
          const childPanelId = childPanel?.id ?? panelId
          return (
            <InlineOrgSection
              key={child.id}
              child={child}
              childPanelId={childPanelId}
              onNavigate={onNavigate}
              onCollapse={() => setOrgOpen(child.id, false)}
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
}: {
  child:       Organization
  childPanelId: string
  onNavigate:  (orgId: string) => void
  onCollapse:  () => void
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
      </div>
      <div className="px-1 pb-1">
        <TreeNode orgId={child.id} panelId={childPanelId} onNavigate={onNavigate} isRoot />
      </div>
    </div>
  )
}
