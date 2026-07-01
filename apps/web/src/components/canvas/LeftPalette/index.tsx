import { useState, useMemo } from 'react'
import { useStore }              from '../../../store/useStore'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
import { OrgPicker }             from '../../common/OrgPicker'
import { OrgSearchSidebar }      from '../../sidebar/OrgSearchSidebar'
import {
  collectRelevantOrgIds,
  collectTopLevelRelevantOrgIds,
  buildOrgPath,
} from '@personnel/domain/rules/options/relevantOrgs'

const PANEL_REORDER_TYPE = 'application/x-panel-reorder'

export function LeftPalette() {
  const { allocationList, afterOrganizations, focusedOrgId, focusOrg } = useStore()
  const { panels, addPanel, removePanel, reorderPanels, isInPanels } = useCanvasLayoutStore()
  const [orgTreeOpen, setOrgTreeOpen] = useState(true)

  // ── Drag reorder state ──────────────────────────────────────────────────
  const [draggedId,       setDraggedId]       = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, panelId: string) => {
    e.dataTransfer.setData(PANEL_REORDER_TYPE, panelId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedId(panelId)
  }

  const handleDragOverSlot = (e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes(PANEL_REORDER_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetIndex(index)
  }

  const handleDropOnSlot = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const srcId = e.dataTransfer.getData(PANEL_REORDER_TYPE)
    if (!srcId) return
    const ids = panels.map(p => p.id)
    const srcIndex = ids.indexOf(srcId)
    if (srcIndex !== -1 && srcIndex !== targetIndex) {
      const next = [...ids]
      next.splice(srcIndex, 1)
      next.splice(targetIndex, 0, srcId)
      reorderPanels(next)
    }
    setDraggedId(null); setDropTargetIndex(null)
  }

  const handleDragEnd = () => { setDraggedId(null); setDropTargetIndex(null) }

  // ── Org data ────────────────────────────────────────────────────────────
  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations],
  )

  const relevantOrgIds = useMemo(
    () => collectRelevantOrgIds(allocationList, afterOrganizations),
    [allocationList, afterOrganizations],
  )

  const topRelevantOrgIds = useMemo(
    () => collectTopLevelRelevantOrgIds(allocationList, afterOrganizations),
    [allocationList, afterOrganizations],
  )

  const memberCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allocationList) {
      if (!r.departmentCode) continue
      const org = afterOrganizations.find(o => o.externalCode === r.departmentCode || o.id === r.departmentCode)
      if (!org) continue
      map.set(org.id, (map.get(org.id) ?? 0) + 1)
    }
    return map
  }, [allocationList, afterOrganizations])

  // 関連組織のうちパネル未登録のもの（最上位のみ表示）
  const unshownTopRelevant = useMemo(
    () => [...topRelevantOrgIds].filter(id => !isInPanels(id) && id !== focusedOrgId),
    [topRelevantOrgIds, isInPanels, focusedOrgId],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">

      {/* ── 表示中パネル ──────────────────────────────────────────── */}
      <section className="flex-shrink-0 px-2 py-2 border-b border-gray-100">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          パネル一覧
        </div>

        <div onDragLeave={() => setDropTargetIndex(null)}>
          {panels.map((panel, index) => {
            const org      = orgById.get(panel.orgId)
            const isActive = focusedOrgId === panel.orgId
            if (!org) return null
            return (
              <div key={panel.id}>
                {dropTargetIndex === index && draggedId !== panel.id && (
                  <div className="h-0.5 bg-blue-400 rounded mx-1 mb-0.5" />
                )}
                <div
                  draggable
                  onDragStart={e => handleDragStart(e, panel.id)}
                  onDragOver={e => handleDragOverSlot(e, index)}
                  onDrop={e => handleDropOnSlot(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => focusOrg(panel.orgId)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded mb-0.5 cursor-pointer transition-colors select-none
                    ${draggedId === panel.id ? 'opacity-40' : ''}
                    ${isActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  <span className="text-gray-300 cursor-grab text-[10px] flex-shrink-0">⠿</span>
                  <span className="flex-1 truncate text-xs font-medium" title={buildOrgPath(org.id, orgById)}>
                    {org.name}
                  </span>
                  <span className="text-gray-400 flex-shrink-0 text-[10px]">
                    {memberCounts.get(panel.orgId) ?? 0}人
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removePanel(panel.id) }}
                    className="text-gray-300 hover:text-red-400 flex-shrink-0 px-0.5 text-xs"
                    title="パネルを閉じる"
                  >×</button>
                </div>
              </div>
            )
          })}
          {/* Drop zone at end of list */}
          <div
            className="h-2"
            onDragOver={e => handleDragOverSlot(e, panels.length)}
            onDrop={e => handleDropOnSlot(e, panels.length)}
          />
          {dropTargetIndex === panels.length && (
            <div className="h-0.5 bg-blue-400 rounded mx-1 mb-0.5" />
          )}
        </div>

        {/* Add panel */}
        <OrgPicker
          value={null}
          onChange={orgId => { addPanel(orgId); focusOrg(orgId) }}
          allOrgs={afterOrganizations}
          relevantOrgIds={new Set([...relevantOrgIds].filter(id => !isInPanels(id)))}
          memberCounts={memberCounts}
          placeholder="＋ 組織を追加"
          triggerClassName="w-full border-dashed text-blue-500 hover:bg-blue-50 justify-center"
        />
      </section>

      {/* ── 関連組織（未登録） ────────────────────────────────────── */}
      {unshownTopRelevant.length > 0 && (
        <section className="flex-shrink-0 px-2 py-2 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            関連組織（未登録）
          </div>
          {unshownTopRelevant.map(orgId => {
            const org = orgById.get(orgId)
            if (!org) return null
            return (
              <div key={orgId} className="flex items-center gap-1.5 mb-1">
                <span
                  className="flex-1 truncate text-gray-600 cursor-pointer hover:text-blue-600"
                  title={buildOrgPath(org.id, orgById)}
                  onClick={() => focusOrg(orgId)}
                >
                  {org.name}
                </span>
                <span className="text-gray-400 flex-shrink-0">{memberCounts.get(orgId) ?? 0}人</span>
                <button
                  onClick={() => { addPanel(orgId); focusOrg(orgId) }}
                  className="text-blue-400 hover:text-blue-600 flex-shrink-0 text-[10px] px-1 border border-blue-200 rounded hover:bg-blue-50"
                  title="パネルに追加"
                >＋</button>
              </div>
            )
          })}
        </section>
      )}

      {/* ── 組織ツリー ─────────────────────────────────────────────── */}
      <button
        className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-b border-gray-100 hover:bg-gray-50 w-full"
        onClick={() => setOrgTreeOpen(o => !o)}
      >
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          組織ツリー
        </span>
        <span className="text-gray-400 text-[10px]">{orgTreeOpen ? '▼' : '▶'}</span>
      </button>

      {orgTreeOpen && (
        <div className="flex-1 overflow-hidden min-h-0">
          <OrgSearchSidebar />
        </div>
      )}
    </div>
  )
}
