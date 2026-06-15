import { useState, useMemo }      from 'react'
import type { Organization }     from '@personnel/domain/schemas'
import { useStore }              from '../../../store/useStore'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
import type { PanelDef }         from '../../../store/canvasLayoutStore'
import { OrgPickerModal }        from '../../common/OrgPickerModal'
import { PanelItem }             from './PanelItem'
import { UnassignedCard }        from './UnassignedCard'
import { usePanelCoverage }      from './usePanelCoverage'
import type { CandidateOrg }     from './usePanelCoverage'

const PANEL_REORDER_TYPE = 'application/x-panel-reorder'
const MAX_CANDIDATE_ROWS = 5

/**
 * 左サイドバーの「組織パネル」タブで使うコンテンツ。
 * 外側コンテナは親（LeftSidebar）が担う。
 */
export function PanelTabContent() {
  const { focusedOrgId, beforeOrganizations } = useStore()
  const {
    panels, addPanel, removePanel, reorderPanels,
    comparisonMode,
    comparisonPanels, addComparisonPanel, removeComparisonPanel, reorderComparisonPanels,
    isInComparisonPanels,
  } = useCanvasLayoutStore()

  const [draggedId,       setDraggedId]       = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const candidates = usePanelCoverage(panels)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const comparisonAddedIds = useMemo(
    () => new Set(comparisonPanels.map(p => p.orgId)),
    [comparisonPanels],
  )

  const comparisonCandidates = useMemo<CandidateOrg[]>(() => {
    if (!comparisonMode) return []
    return beforeOrganizations
      .filter(o => !isInComparisonPanels(o.id))
      .map(o => ({ orgId: o.id, orgName: o.name, uncoveredCount: 0 }))
  }, [comparisonMode, beforeOrganizations, isInComparisonPanels, comparisonPanels]) // eslint-disable-line react-hooks/exhaustive-deps

  const activePanels      = comparisonMode ? comparisonPanels : panels
  const handleReorder     = comparisonMode ? reorderComparisonPanels : reorderPanels
  const handleRemovePanel = comparisonMode ? removeComparisonPanel : removePanel

  // ── Drag reorder ─────────────────────────────────────────────────────────
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
    const ids = activePanels.map(p => p.id)
    const srcIndex = ids.indexOf(srcId)
    if (srcIndex !== -1 && srcIndex !== targetIndex) {
      const next = [...ids]
      next.splice(srcIndex, 1)
      next.splice(targetIndex, 0, srcId)
      handleReorder(next)
    }
    setDraggedId(null); setDropTargetIndex(null)
  }

  const handleDragEnd = () => { setDraggedId(null); setDropTargetIndex(null) }

  const handleAddSelect = (orgId: string) => {
    if (comparisonMode) addComparisonPanel(orgId)
    else addPanel(orgId)
  }

  return (
    <>
      <OrgPickerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSelect={handleAddSelect}
        title={comparisonMode ? '旧組織をパネルに追加' : '組織をパネルに追加'}
        orgs={comparisonMode ? beforeOrganizations : undefined}
        alreadyAddedIds={comparisonMode ? comparisonAddedIds : undefined}
      />

      <div className="flex flex-col h-full overflow-hidden">

        {comparisonMode && (
          <div className="flex-shrink-0 px-2 py-1 bg-indigo-50 border-b border-indigo-100 text-[10px] text-indigo-600 font-medium">
            比較モード — 旧組織を選択中
          </div>
        )}

        <div className="flex-1 overflow-y-auto">

          {/* ── パネル一覧 ──────────────────────────────────────── */}
          <div className="py-1" onDragLeave={() => setDropTargetIndex(null)}>
            {activePanels.map((panel, index) => (
              <div key={panel.id}>
                {dropTargetIndex === index && draggedId !== panel.id && (
                  <div className="h-0.5 bg-blue-400 mx-2 rounded mb-0.5" />
                )}
                {comparisonMode ? (
                  <ComparisonPanelItem
                    panel={panel}
                    isDragging={draggedId === panel.id}
                    beforeOrganizations={beforeOrganizations}
                    onDragStart={e => handleDragStart(e, panel.id)}
                    onDragOver={e => handleDragOverSlot(e, index)}
                    onDrop={e => handleDropOnSlot(e, index)}
                    onDragEnd={handleDragEnd}
                    onRemove={() => handleRemovePanel(panel.id)}
                  />
                ) : (
                  <PanelItem
                    panel={panel}
                    isActive={focusedOrgId === panel.orgId}
                    isDragging={draggedId === panel.id}
                    onDragStart={e => handleDragStart(e, panel.id)}
                    onDragOver={e => handleDragOverSlot(e, index)}
                    onDrop={e => handleDropOnSlot(e, index)}
                    onDragEnd={handleDragEnd}
                    onRemove={() => handleRemovePanel(panel.id)}
                  />
                )}
              </div>
            ))}
            {dropTargetIndex === activePanels.length && (
              <div className="h-0.5 bg-blue-400 mx-2 rounded mb-0.5" />
            )}
            <div
              className="h-4"
              onDragOver={e => handleDragOverSlot(e, activePanels.length)}
              onDrop={e => handleDropOnSlot(e, activePanels.length)}
            />
            <div className="px-2 pb-1">
              <button
                onClick={() => setAddModalOpen(true)}
                className="w-full py-1 text-xs text-blue-500 border border-dashed border-blue-300 rounded hover:bg-blue-50 transition-colors"
              >
                ＋ パネルを追加
              </button>
            </div>
          </div>

          {/* ── 未網羅の候補（通常モード） ─────────────────────────── */}
          {!comparisonMode && candidates.length > 0 && (
            <CandidateSection
              candidates={candidates}
              onAdd={orgId => addPanel(orgId)}
            />
          )}

          {/* 比較モード: 未追加の旧組織候補 */}
          {comparisonMode && comparisonCandidates.length > 0 && (
            <CandidateSection
              candidates={comparisonCandidates}
              onAdd={orgId => addComparisonPanel(orgId)}
              label="未追加の旧組織"
              extraOrgs={beforeOrganizations}
            />
          )}
        </div>

        {/* ── 未設定（下部固定）: 比較モード時は非表示 ──────────────── */}
        {!comparisonMode && (
          <div className="flex-shrink-0 border-t border-gray-100">
            <UnassignedCard />
          </div>
        )}
      </div>
    </>
  )
}

// ── 比較モード用シンプルパネルアイテム ───────────────────────────────────────
function ComparisonPanelItem({
  panel, isDragging, beforeOrganizations, onDragStart, onDragOver, onDrop, onDragEnd, onRemove,
}: {
  panel:               PanelDef
  isDragging:          boolean
  beforeOrganizations: Organization[]
  onDragStart:         (e: React.DragEvent) => void
  onDragOver:          (e: React.DragEvent) => void
  onDrop:              (e: React.DragEvent) => void
  onDragEnd:           () => void
  onRemove:            () => void
}) {
  const org = beforeOrganizations.find(o => o.id === panel.orgId)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1.5 px-2 py-1.5 mx-1 my-0.5 rounded cursor-grab select-none transition-opacity ${
        isDragging ? 'opacity-40' : 'hover:bg-gray-50'
      }`}
    >
      <span className="text-gray-400 text-[10px]">⋮⋮</span>
      <span className="flex-1 text-xs text-gray-700 truncate">{org?.name ?? panel.orgId}</span>
      <button onClick={onRemove} className="text-gray-400 hover:text-gray-600 text-[10px]">✕</button>
    </div>
  )
}

// ── 候補セクション ────────────────────────────────────────────────────────
interface CandidateSectionProps {
  candidates: CandidateOrg[]
  onAdd:      (orgId: string) => void
  label?:     string
  extraOrgs?: Organization[]
}

function CandidateSection({ candidates, onAdd, label, extraOrgs }: CandidateSectionProps) {
  const [open,      setOpen]      = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const direct   = candidates.slice(0, MAX_CANDIDATE_ROWS)
  const overflow = candidates.length - MAX_CANDIDATE_ROWS

  return (
    <div className="border-t border-orange-100 bg-orange-50">
      <button
        className="w-full flex items-center justify-between px-2 py-1 hover:bg-orange-100 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[10px] font-semibold text-orange-700">
          {label ?? '未網羅の候補'} ({candidates.length}件)
        </span>
        <span className="text-orange-400 text-[10px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          {direct.map(c => (
            <div key={c.orgId} className="flex items-center gap-1.5">
              <span className="flex-1 text-[10px] text-gray-700 truncate" title={c.orgName}>{c.orgName}</span>
              {c.uncoveredCount > 0 && (
                <span className="text-[10px] text-orange-500 flex-shrink-0">{c.uncoveredCount}人</span>
              )}
              <button
                onClick={() => onAdd(c.orgId)}
                className="text-[10px] text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-1 hover:bg-blue-50 flex-shrink-0"
              >＋</button>
            </div>
          ))}
          {overflow > 0 && (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className="w-full py-0.5 text-[10px] text-orange-600 border border-orange-200 rounded hover:bg-orange-100"
              >他 {overflow} 件…</button>
              <OrgPickerModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSelect={onAdd}
                title={label ? `${label}を追加` : '未網羅の組織を追加'}
                orgs={extraOrgs}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
