import { useState }              from 'react'
import { useStore }              from '../../../store/useStore'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
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
  const { focusedOrgId } = useStore()
  const { panels, addPanel, removePanel, reorderPanels } = useCanvasLayoutStore()

  const [draggedId,       setDraggedId]       = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const candidates = usePanelCoverage(panels)
  const [addModalOpen, setAddModalOpen] = useState(false)

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

  return (
    <>
      {/* 組織追加モーダル */}
      <OrgPickerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSelect={orgId => { addPanel(orgId) }}
        title="組織をパネルに追加"
      />

    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* ── パネル一覧 ──────────────────────────────────────── */}
        <div className="py-1" onDragLeave={() => setDropTargetIndex(null)}>
          {panels.map((panel, index) => (
            <div key={panel.id}>
              {dropTargetIndex === index && draggedId !== panel.id && (
                <div className="h-0.5 bg-blue-400 mx-2 rounded mb-0.5" />
              )}
              <PanelItem
                panel={panel}
                isActive={focusedOrgId === panel.orgId}
                isDragging={draggedId === panel.id}
                onDragStart={e => handleDragStart(e, panel.id)}
                onDragOver={e => handleDragOverSlot(e, index)}
                onDrop={e => handleDropOnSlot(e, index)}
                onDragEnd={handleDragEnd}
                onRemove={() => removePanel(panel.id)}
              />
            </div>
          ))}
          {dropTargetIndex === panels.length && (
            <div className="h-0.5 bg-blue-400 mx-2 rounded mb-0.5" />
          )}
          <div
            className="h-4"
            onDragOver={e => handleDragOverSlot(e, panels.length)}
            onDrop={e => handleDropOnSlot(e, panels.length)}
          />
          <div className="px-2 pb-1">
            <button
              onClick={() => setAddModalOpen(true)}
              className="w-full py-1 text-xs text-blue-500 border border-dashed border-blue-300 rounded hover:bg-blue-50 transition-colors"
            >
              ＋ 組織を追加
            </button>
          </div>
        </div>

        {/* ── 未網羅の候補 ─────────────────────────────────────── */}
        {candidates.length > 0 && (
          <CandidateSection
            candidates={candidates}
            onAdd={orgId => addPanel(orgId)}
          />
        )}
      </div>

      {/* ── 未設定（下部固定） ──────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-100">
        <UnassignedCard />
      </div>
    </div>
    </>
  )
}

// ── 候補セクション ────────────────────────────────────────────────────────
interface CandidateSectionProps {
  candidates: CandidateOrg[]
  onAdd:      (orgId: string) => void
}

function CandidateSection({ candidates, onAdd }: CandidateSectionProps) {
  const [open,        setOpen]        = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const direct   = candidates.slice(0, MAX_CANDIDATE_ROWS)
  const overflow = candidates.length - MAX_CANDIDATE_ROWS

  return (
    <div className="border-t border-orange-100 bg-orange-50">
      <button
        className="w-full flex items-center justify-between px-2 py-1 hover:bg-orange-100 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[10px] font-semibold text-orange-700">
          未網羅の候補 ({candidates.length}件)
        </span>
        <span className="text-orange-400 text-[10px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          {direct.map(c => (
            <div key={c.orgId} className="flex items-center gap-1.5">
              <span className="flex-1 text-[10px] text-gray-700 truncate" title={c.orgName}>{c.orgName}</span>
              <span className="text-[10px] text-orange-500 flex-shrink-0">{c.uncoveredCount}人</span>
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
                title="未網羅の組織を追加"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
