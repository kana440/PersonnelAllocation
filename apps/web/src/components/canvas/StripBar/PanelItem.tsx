import { useState, useMemo, useEffect } from 'react'
import type { PanelDef }      from '../../../store/canvasLayoutStore'
import { useStore }           from '../../../store/useStore'
import { useStripCardData }   from './useStripCardData'
import { PanelChips }         from './PanelChips'
import { usePanelDrop }       from './usePanelDrop'

interface Props {
  panel:       PanelDef
  isActive:    boolean
  isDragging:  boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver:  (e: React.DragEvent) => void
  onDrop:      (e: React.DragEvent) => void
  onDragEnd:   () => void
  onRemove:    () => void
}

export function PanelItem({
  panel, isActive, isDragging,
  onDragStart, onDragOver, onDrop, onDragEnd, onRemove,
}: Props) {
  const { focusOrg }  = useStore()
  const { org, orgById, childrenOf, allMembers, subtreeCountByOrg } = useStripCardData(panel.orgId)

  const [currentOrgId, setCurrentOrgId] = useState(panel.orgId)
  const [showSubOrgs,  setShowSubOrgs]  = useState(false)
  useEffect(() => { setShowSubOrgs(false) }, [currentOrgId])

  const currentOrg    = orgById.get(currentOrgId) ?? org
  const isDrilledDown = currentOrgId !== panel.orgId

  const { personDragOver, handleDragOver: dropDragOver, handleDragLeave, handleDrop: dropHandle }
    = usePanelDrop(currentOrg)

  // 子組織（廃止済みを除く全組織）
  const childOrgs = useMemo(
    () => (childrenOf.get(currentOrgId) ?? []).filter(o => !o.isAbandoned),
    [childrenOf, currentOrgId],
  )

  // パンくずパス
  const breadcrumb = useMemo(() => {
    const path: string[] = []
    let cur = orgById.get(currentOrgId)
    while (cur) {
      path.unshift(cur.id)
      if (cur.id === panel.orgId) break
      cur = cur.parentId ? orgById.get(cur.parentId) : undefined
    }
    return path
  }, [currentOrgId, panel.orgId, orgById])

  if (!org) return null

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-panel-reorder')) { onDragOver(e); return }
    dropDragOver(e)
  }

  const handleDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-panel-reorder')) { onDrop(e); return }
    dropHandle(e)
  }

  const currentCount = subtreeCountByOrg.get(currentOrgId) ?? 0
  const directCount  = allMembers.filter(m => m.subOrgId === currentOrgId).length
  const countLabel   = currentCount > directCount
    ? `${currentCount}人（直下${directCount}）`
    : `${currentCount}人`

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onDragEnd={onDragEnd}
      onClick={() => focusOrg(panel.orgId)}
      className={`mx-2 mb-1 rounded-lg border-2 cursor-pointer select-none transition-all
        ${isDragging      ? 'opacity-40' : ''}
        ${isActive        ? 'border-blue-400 bg-blue-50'
          : personDragOver ? 'border-green-400 bg-green-50'
          :                  'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'}`}
    >
      {/* ヘッダー行 */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <span className="text-gray-300 text-[10px] flex-shrink-0 cursor-grab">⠿</span>
        <button
          onClick={e => { e.stopPropagation(); setCurrentOrgId(panel.orgId) }}
          className={`flex-1 text-xs font-semibold truncate text-left ${isActive ? 'text-blue-700' : 'text-gray-700'}`}
          title={org.name}
        >{org.name}</button>
        {!isDrilledDown && childOrgs.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setShowSubOrgs(v => !v) }}
            className="text-gray-400 hover:text-blue-500 text-[10px] flex-shrink-0 px-0.5"
          >{showSubOrgs ? '△' : '▽'}</button>
        )}
        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
          {subtreeCountByOrg.get(panel.orgId) ?? 0}人
        </span>
        <button onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0 leading-none ml-0.5"
        >×</button>
      </div>

      {/* パンくず（ドリルダウン時） */}
      {isDrilledDown && (
        <div className="px-2 pb-0.5">
          {breadcrumb.slice(1).map((id, i) => {
            const o      = orgById.get(id)
            const isLast = i === breadcrumb.length - 2
            const cnt    = subtreeCountByOrg.get(id) ?? 0
            return (
              <div key={id} style={{ paddingLeft: `${(i + 1) * 8}px` }}
                className="flex items-center gap-0.5 leading-tight">
                <span className="text-gray-300 text-[10px] flex-shrink-0">›</span>
                <button onClick={e => { e.stopPropagation(); setCurrentOrgId(id) }}
                  className={`flex-1 text-[10px] text-left truncate ${isLast ? 'font-medium text-blue-600' : 'text-gray-400 hover:text-blue-500'}`}
                >{o?.name}</button>
                {isLast ? (
                  <>
                    {childOrgs.length > 0 && (
                      <button onClick={e => { e.stopPropagation(); setShowSubOrgs(v => !v) }}
                        className="text-gray-400 hover:text-blue-500 text-[10px] flex-shrink-0 px-0.5"
                      >{showSubOrgs ? '△' : '▽'}</button>
                    )}
                    <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap ml-0.5">{countLabel}</span>
                    <button onClick={e => { e.stopPropagation(); setCurrentOrgId(panel.orgId) }}
                      className="text-gray-400 hover:text-blue-500 text-[10px] flex-shrink-0 ml-0.5"
                    >↺</button>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-300 flex-shrink-0 whitespace-nowrap ml-0.5">{cnt}人</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 子組織（▽展開時） */}
      {showSubOrgs && childOrgs.length > 0 && (
        <div className="px-2 pt-0.5 pb-0.5 space-y-0.5">
          {childOrgs.map(child => (
            <button key={child.id}
              onClick={e => { e.stopPropagation(); setCurrentOrgId(child.id) }}
              className="w-full flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
            >
              <span className="flex-shrink-0">▶</span>
              <span className="flex-1 text-left truncate">{child.name}</span>
              <span className="flex-shrink-0 text-gray-400">{subtreeCountByOrg.get(child.id) ?? 0}人</span>
            </button>
          ))}
        </div>
      )}

      {/* チップ + 検索 */}
      <PanelChips
        allMembers={allMembers}
        currentOrgId={currentOrgId}
        panelOrgId={panel.orgId}
        childrenOf={childrenOf}
      />
    </div>
  )
}
