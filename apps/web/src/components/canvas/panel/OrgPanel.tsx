import { useOrgView } from '../OrgViewContext'
import { subtreeRowCount } from './helpers'
import { OrgSection } from './OrgSection'

interface OrgPanelProps {
  orgId:      string
  panelId:    string
  colorIndex: number
  onRemove:   () => void
}

export function OrgPanel({ orgId, panelId, colorIndex, onRemove }: OrgPanelProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const org = organizations.find(o => o.id === orgId)
  if (!org) return null

  const totalCount  = subtreeRowCount(orgId, organizations, positionTreeByOrgId)
  const isDropTarget = dragOverOrgId === orgId

  return (
    <div
      className={`flex-shrink-0 w-64 max-h-full flex flex-col border-2 rounded-xl shadow-sm transition-colors ${
        isDropTarget ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-white'
      }`}
      onDragOver={e => handleDragOver(e, orgId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, orgId)}
    >
      {/* パネルヘッダ */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{org.name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0">({totalCount}名)</span>
        <button
          onClick={onRemove}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-[10px] leading-none"
          title="パネルを閉じる"
        >✕</button>
      </div>

      {/* スクロール可能な本体 */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        <OrgSection orgId={orgId} panelId={panelId} isRoot colorIndex={colorIndex} />
        {totalCount === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-3">メンバーなし</p>
        )}
      </div>
    </div>
  )
}
