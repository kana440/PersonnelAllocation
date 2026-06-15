import { useState, useEffect, useCallback, useRef } from 'react'
import type { PanelDef, ChildrenMode } from '../../../store/canvasLayoutStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useBeforeOrgView, beforeSubtreeRowCount, beforeHasAnyRows } from './BeforeOrgViewContext'
import { BeforeTreeNode } from './BeforeTreeNode'
import type { OrgMappingDragData } from '../comparison/BeforeOrgWindow'

const MAX_BODY_H = 1600

const MODES: { key: ChildrenMode; label: string; title: string }[] = [
  { key: 'windowed', label: '展開', title: '子組織をそれぞれ別ウィンドウで開く' },
  { key: 'inline',  label: 'リスト', title: '子組織をこのウィンドウ内にリスト表示' },
]

export function BeforeTreeWindow({ panel }: { panel: PanelDef }) {
  const {
    beforeOrganizations, beforeRowsByOrgId,
    comparisonOrgMapping, afterOrganizations,
  } = useBeforeOrgView()

  const {
    setComparisonPosition, toggleComparisonPanelOpen, setComparisonChildrenMode,
  } = useCanvasLayoutStore()

  const totalCount = beforeSubtreeRowCount(panel.orgId, beforeOrganizations, beforeRowsByOrgId)

  // マッピング
  const mappedAfterId  = comparisonOrgMapping[panel.orgId]
  const mappedAfterOrg = mappedAfterId ? afterOrganizations.find(o => o.id === mappedAfterId) : null
  const headerBg       = mappedAfterOrg ? '#4a7c59' : '#5c5248'

  // ── ウィンドウ移動（マウスドラッグ）────────────────────────────
  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragging.current   = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: panel.x, py: panel.y }
  }, [panel.x, panel.y])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const { mx, my, px, py } = dragOrigin.current
      setComparisonPosition(panel.id, Math.max(0, px + e.clientX - mx), Math.max(0, py + e.clientY - my))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panel.id, setComparisonPosition])

  // ── ブレッドクラム ─────────────────────────────────────────────
  const [rootPath, setRootPath] = useState([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = beforeOrganizations.find(o => o.id === currentRootId)
  const hasChildren   = beforeOrganizations.some(
    o => o.parentId === currentRootId && beforeHasAnyRows(o.id, beforeOrganizations, beforeRowsByOrgId),
  )

  return (
    <div
      data-before-window="true"
      data-panelid={panel.id}
      className="flex flex-col rounded shadow-lg border border-gray-400 select-none overflow-hidden"
      style={{ background: '#ffffff', width: 288 }}
    >
      {/* ── タイトルバー ──────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
        style={{ background: headerBg, userSelect: 'none' }}
      >
        {/* メインタイトル行 */}
        <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
          {/* org-mapping ドラッグハンドル */}
          <div
            data-drag-handle="true"
            draggable
            onDragStart={e => {
              e.stopPropagation()
              const data: OrgMappingDragData = { dragType: 'org-mapping', beforeOrgId: panel.orgId }
              e.dataTransfer.setData('application/json', JSON.stringify(data))
              e.dataTransfer.effectAllowed = 'link'
            }}
            className="flex-shrink-0 cursor-grab text-stone-300 hover:text-white px-0.5 text-[12px] leading-none"
            title="ドラッグして右側の新組織タイトルバーにドロップしてマッピング"
          >⠿</div>

          {/* ブレッドクラム or 組織名 */}
          <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
            {rootPath.length > 1 ? (
              rootPath.map((id, i) => {
                const o      = beforeOrganizations.find(o => o.id === id)
                const isLast = i === rootPath.length - 1
                return (
                  <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                    {i > 0 && <span className="text-stone-400 text-[9px]">/</span>}
                    <button
                      onClick={() => setRootPath(prev => prev.slice(0, i + 1))}
                      className={`text-[10px] max-w-[5rem] truncate ${
                        isLast ? 'font-semibold text-white cursor-default' : 'text-stone-300 hover:text-white'
                      }`}
                    >{o?.name ?? id}</button>
                  </span>
                )
              })
            ) : (
              <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? currentRootId}</span>
            )}
            <span className="text-[10px] text-stone-300 flex-shrink-0 ml-0.5">({totalCount})</span>
          </div>

          {/* ボタン群 */}
          <div className="flex items-center flex-shrink-0">
            {rootPath.length > 1 && (
              <button
                onClick={() => setRootPath(prev => prev.slice(0, prev.length - 1))}
                className="w-5 h-5 flex items-center justify-center text-[10px] text-stone-300 hover:text-white hover:bg-stone-600 rounded"
                title="一つ上へ"
              >↑</button>
            )}
            <button
              onClick={() => toggleComparisonPanelOpen(panel.id)}
              title={panel.open ? '折りたたむ' : '展開'}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-stone-600 text-xs transition-colors"
            >{panel.open ? '─' : '▲'}</button>
          </div>
        </div>

        {/* マッピングバッジ */}
        <div className="flex items-center gap-1 px-2 pb-0.5" style={{ minHeight: 16 }}>
          {mappedAfterOrg ? (
            <>
              <span className="text-[9px] text-white opacity-70">→</span>
              <span className="flex-1 text-[9px] text-white font-medium truncate opacity-90">
                {mappedAfterOrg.name}
              </span>
            </>
          ) : (
            <span className="text-[9px] text-stone-400 italic">⠿ をドラッグして新組織にマッピング</span>
          )}
        </div>
      </div>

      {/* ── 子組織モードセレクター ────────────────────────────────── */}
      {panel.open && hasChildren && (
        <div className="flex-shrink-0 flex bg-gray-100 border-b border-gray-200" style={{ height: 24 }}>
          {MODES.map(({ key, label, title }) => {
            const active = panel.childrenMode === key
            return (
              <button
                key={key}
                onClick={() => setComparisonChildrenMode(panel.id, key)}
                title={title}
                className={`flex-1 text-[10px] font-medium border-r last:border-r-0 border-gray-200 transition-colors ${
                  active ? 'bg-white text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                }`}
              >{label}</button>
            )
          })}
        </div>
      )}

      {/* ── ボディ ───────────────────────────────────────────────── */}
      {panel.open && (
        <div className="overflow-y-auto p-1.5" style={{ maxHeight: MAX_BODY_H }}>
          {currentOrg ? (
            <BeforeTreeNode
              key={currentRootId}
              orgId={currentRootId}
              panelId={panel.id}
              onNavigate={id => setRootPath(prev => [...prev, id])}
              isRoot
            />
          ) : (
            <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
          )}
        </div>
      )}
    </div>
  )
}
