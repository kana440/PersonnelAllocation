import { useOrgView } from '../OrgViewContext'
import { PositionRows } from './PositionRows'

export function DropZone({ orgId, compact = false }: { orgId: string; compact?: boolean }) {
  const { dragOverOrgId, afterMembersByOrgId } = useOrgView()
  const isDragOver = dragOverOrgId === orgId
  const isEmpty    = (afterMembersByOrgId.get(orgId) ?? []).length === 0
  return (
    <div className={`${compact ? 'min-h-6 py-1' : 'min-h-8 py-1.5'} rounded border border-dashed text-xs text-center transition-colors ${
      isDragOver ? 'border-blue-400 bg-blue-100 text-blue-600' : 'border-gray-300 text-gray-300'
    }`}>
      {isDragOver ? 'ここにドロップ' : isEmpty && !compact ? 'ドロップで異動' : ''}
    </div>
  )
}


export function CollapsedOrgChip({ orgId }: { orgId: string }) {
  const {
    organizations, afterMembersByOrgId,
    dragOverOrgId, highlightedOrgId,
    handleDragOver, handleDragLeave, handleDrop,
    handleAddPosition,
    setBulkMoveSourceId, expandedChipIds, toggleChip,
  } = useOrgView()

  const org = organizations.find(o => o.id === orgId)
  if (!org) return null

  const personsInOrg  = afterMembersByOrgId.get(orgId) ?? []
  const childOrgIds   = organizations.filter(o => o.parentId === orgId).map(o => o.id)
  const isDragOver    = dragOverOrgId === orgId
  const isHighlighted = highlightedOrgId === orgId
  const isExpanded    = expandedChipIds.has(orgId)

  if (!isExpanded) {
    return (
      <div
        className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs cursor-pointer select-none transition-all ${
          isHighlighted ? 'border-green-400 bg-green-50' : isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
        onClick={() => toggleChip(orgId)}
        onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
        onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
        onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
      >
        <span className="text-gray-400">▸</span>
        <span className="font-medium text-gray-700 truncate flex-1">{org.name}</span>
        {personsInOrg.length > 0 && <span className="text-gray-400">{personsInOrg.length}名</span>}
        {childOrgIds.length > 0 && <span className="text-gray-400">{childOrgIds.length}組織</span>}
        {isDragOver && <span className="text-blue-500">← ドロップ</span>}
      </div>
    )
  }

  return (
    <div
      className={`border-2 rounded-lg transition-all ${
        isHighlighted ? 'border-green-400 bg-green-50' : isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
      onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
      onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
      onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
    >
      <div className="px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 flex items-center gap-1" onClick={() => toggleChip(orgId)}>
        <span className="text-gray-400">▾</span>
        <span className="flex-1">{org.name}</span>
        <button
          onClick={e => { e.stopPropagation(); handleAddPosition(orgId, org.externalCode ?? org.id) }}
          className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
          title="ポジションを追加（空席）"
        >＋席</button>
        <button
          onClick={e => { e.stopPropagation(); setBulkMoveSourceId(orgId) }}
          className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          title="このボックスのメンバを別組織に一括移動"
        >⇄ 移動</button>
      </div>
      <div className="p-2">
        <PositionRows orgId={orgId} />
        <DropZone orgId={orgId} />
        {childOrgIds.length > 0 && (
          <div className="mt-2 space-y-1">
            {childOrgIds.map(id => <CollapsedOrgChip key={id} orgId={id} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export function OrgBox({ orgId, depth = 0 }: { orgId: string; depth?: number }) {
  const {
    organizations,
    dragOverOrgId, highlightedOrgId,
    handleDragOver, handleDragLeave, handleDrop,
    handleAddPosition,
    setBulkMoveSourceId,
  } = useOrgView()

  const org = organizations.find(o => o.id === orgId)
  if (!org) return null

  const childOrgIds   = organizations.filter(o => o.parentId === orgId).map(o => o.id)
  const isDragOver    = dragOverOrgId === orgId
  const isHighlighted = highlightedOrgId === orgId

  return (
    <div
      className={`border-2 rounded-lg transition-all ${
        isHighlighted ? 'border-green-400 bg-green-50' : isDragOver ? 'border-blue-400 bg-blue-50' :
        depth === 0 ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
      onDragOver={e => handleDragOver(e, orgId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, orgId)}
    >
      <div className={`px-3 py-1.5 border-b text-xs font-semibold flex items-center gap-1 ${
        depth === 0 ? 'border-gray-300 text-gray-600 bg-gray-100 rounded-t-lg' : 'border-gray-200 text-gray-500 bg-gray-50 rounded-t-lg'
      }`}>
        <span className="flex-1">{org.name}</span>
        <button
          onClick={e => { e.stopPropagation(); handleAddPosition(orgId, org.externalCode ?? org.id) }}
          className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
          title="ポジションを追加（空席）"
        >＋席</button>
        <button
          onClick={e => { e.stopPropagation(); setBulkMoveSourceId(orgId) }}
          className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          title="このボックスのメンバを別組織に一括移動"
        >⇄ 移動</button>
      </div>
      <div className="p-2">
        <PositionRows orgId={orgId} />
        <DropZone orgId={orgId} />
        {childOrgIds.length > 0 && (
          <div className="mt-2 space-y-1">
            {childOrgIds.map(id => <CollapsedOrgChip key={id} orgId={id} />)}
          </div>
        )}
      </div>
    </div>
  )
}
