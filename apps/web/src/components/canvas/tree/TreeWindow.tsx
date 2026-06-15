import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useOrgView }            from '../OrgViewContext'
import { subtreeRowCount, hasAnyRows } from '../panel/helpers'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
import type { PanelDef, ChildrenMode } from '../../../store/canvasLayoutStore'
import { TreeNode }              from './TreeNode'
import { useStore }              from '../../../store/useStore'
import { isSecondmentOrg }      from '@personnel/domain/derivation'
import { parseOrgMappingDrag }  from '../comparison/BeforeOrgWindow'

const MAX_BODY_H = 1600  // 約30人分 (1カード≈52px)

interface TreeWindowProps {
  panel: PanelDef
}

// ── アイコン ──────────────────────────────────────────────────────
function TreeStructureIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
      <rect x="0" y="0" width="4.5" height="3" rx="0.5"/>
      <line x1="2.2" y1="3" x2="2.2" y2="9" stroke="currentColor" strokeWidth="0.8" fill="none"/>
      <line x1="2.2" y1="4.5" x2="5" y2="4.5" stroke="currentColor" strokeWidth="0.8" fill="none"/>
      <line x1="2.2" y1="7.5" x2="5" y2="7.5" stroke="currentColor" strokeWidth="0.8" fill="none"/>
      <rect x="5" y="3" width="4" height="3" rx="0.5"/>
      <rect x="5" y="6" width="4" height="3" rx="0.5"/>
    </svg>
  )
}

// ── モードセレクター（windowed / inline の2択）────────────────────
const MODES: { key: ChildrenMode; icon: React.ReactNode; label: string; title: string }[] = [
  {
    key:   'windowed',
    icon:  <TreeStructureIcon />,
    label: '展開',
    title: '子組織をそれぞれ別ウィンドウで開く',
  },
  {
    key:   'inline',
    icon:  <span className="text-[11px] leading-none">☰</span>,
    label: 'リスト',
    title: '子組織をこのウィンドウ内にリスト表示',
  },
]

export function TreeWindow({ panel }: TreeWindowProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const {
    setPosition, toggleOpen, setChildrenMode,
    comparisonMode, comparisonOrgMapping, setComparisonOrgMap, clearComparisonOrgMap,
  } = useCanvasLayoutStore()
  const codeLists         = useStore(s => s.codeLists)
  const beforeOrganizations = useStore(s => s.beforeOrganizations)

  // ── ヘッダー色 ─────────────────────────────────────────────────
  const org = organizations.find(o => o.id === panel.orgId)
  const hasRows   = subtreeRowCount(panel.orgId, organizations, positionTreeByOrgId) > 0
  const isSecondment = org?.externalCode
    ? isSecondmentOrg(org.externalCode, codeLists)
    : false
  // 出向者用組織: forest green / 空の組織: brick red / 通常: Windows-blue
  const headerBg = isSecondment ? '#2e7d52' : !hasRows ? '#b54520' : '#3c7abf'

  // ── 比較マッピング ─────────────────────────────────────────────
  // このウィンドウ (panel.orgId) にマッピングされている旧組織を逆引き
  const mappedBeforeOrgId = useMemo(
    () => Object.entries(comparisonOrgMapping).find(([, afterId]) => afterId === panel.orgId)?.[0],
    [comparisonOrgMapping, panel.orgId],
  )
  const mappedBeforeOrg = mappedBeforeOrgId
    ? beforeOrganizations.find(o => o.id === mappedBeforeOrgId)
    : null

  // ── ドラッグ（ウィンドウ移動）─────────────────────────────────
  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragging.current   = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: panel.x, py: panel.y }
  }, [panel.x, panel.y])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const { mx, my, px, py } = dragOrigin.current
      setPosition(panel.id, Math.max(0, px + e.clientX - mx), Math.max(0, py + e.clientY - my))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panel.id, setPosition])

  // ── 比較モード: org-mapping ドロップ受け口 ─────────────────────
  const [mappingDragOver, setMappingDragOver] = useState(false)

  const onTitleDragOver = useCallback((e: React.DragEvent) => {
    if (!comparisonMode) return
    const data = parseOrgMappingDrag(e)
    if (!data) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'link'
    setMappingDragOver(true)
  }, [comparisonMode])

  const onTitleDragLeave = useCallback(() => {
    setMappingDragOver(false)
  }, [])

  const onTitleDrop = useCallback((e: React.DragEvent) => {
    setMappingDragOver(false)
    if (!comparisonMode) return
    const data = parseOrgMappingDrag(e)
    if (!data) return
    e.preventDefault()
    e.stopPropagation()
    setComparisonOrgMap(data.beforeOrgId, panel.orgId)
  }, [comparisonMode, panel.orgId, setComparisonOrgMap])

  // ── ナビゲーション ─────────────────────────────────────────────
  const [rootPath, setRootPath] = useState<string[]>([panel.orgId])
  useEffect(() => { setRootPath([panel.orgId]) }, [panel.orgId])
  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = organizations.find(o => o.id === currentRootId)
  const totalCount    = subtreeRowCount(currentRootId, organizations, positionTreeByOrgId)
  const isDragOver    = dragOverOrgId === currentRootId

  const navigateTo    = (childOrgId: string) => setRootPath(prev => [...prev, childOrgId])
  const navigateToIdx = (idx: number)        => setRootPath(prev => prev.slice(0, idx + 1))

  const hasChildren = organizations.some(
    o => o.parentId === currentRootId && hasAnyRows(o.id, organizations, positionTreeByOrgId),
  )

  return (
    <div
      data-window="true"
      data-panelid={panel.id}
      className={`flex flex-col rounded shadow-lg border transition-colors select-none overflow-hidden
        ${isDragOver ? 'border-blue-400' : 'border-gray-400'}`}
      style={{ background: '#ffffff', width: 288 }}
      onDragOver={e => handleDragOver(e, currentRootId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, currentRootId)}
    >
      {/* ── タイトルバー ─────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        onDragOver={onTitleDragOver}
        onDragLeave={onTitleDragLeave}
        onDrop={onTitleDrop}
        className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
        style={{
          background: mappingDragOver ? '#4a90d9' : headerBg,
          userSelect: 'none',
          outline: mappingDragOver ? '2px dashed #ffffff' : undefined,
        }}
      >
        {/* メインタイトル行 */}
        <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
          {/* 左: パンくず or 組織名 */}
          <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
            {rootPath.length > 1 ? (
              rootPath.map((id, i) => {
                const o      = organizations.find(o => o.id === id)
                const isLast = i === rootPath.length - 1
                return (
                  <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                    {i > 0 && <span className="text-blue-300 text-[9px]">/</span>}
                    <button
                      onClick={() => navigateToIdx(i)}
                      className={`text-[10px] max-w-[5rem] truncate ${
                        isLast ? 'font-semibold text-white cursor-default' : 'text-blue-200 hover:text-white'
                      }`}
                    >{o?.name ?? id}</button>
                  </span>
                )
              })
            ) : (
              <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? currentRootId}</span>
            )}
            <span className="text-[10px] text-blue-200 flex-shrink-0 ml-0.5">({totalCount})</span>
          </div>

          {/* 右: ナビ + 折りたたみボタン（閉じるボタンなし） */}
          <div className="flex items-center flex-shrink-0">
            {rootPath.length > 1 && (
              <button
                onClick={() => navigateToIdx(rootPath.length - 2)}
                className="w-5 h-5 flex items-center justify-center text-[10px] text-blue-200 hover:text-white hover:bg-blue-700 rounded transition-colors"
                title="一つ上へ"
              >↑</button>
            )}
            <button
              onClick={() => toggleOpen(panel.id)}
              title={panel.open ? '折りたたむ' : '展開'}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-blue-700 text-xs transition-colors"
            >{panel.open ? '─' : '▲'}</button>
          </div>
        </div>

        {/* 比較マッピングバッジ */}
        {comparisonMode && (
          <div
            className="flex items-center gap-1 px-2 pb-0.5"
            style={{ minHeight: 16 }}
          >
            {mappedBeforeOrg ? (
              <>
                <span className="text-[9px] text-white opacity-70">←</span>
                <span className="flex-1 text-[9px] text-white font-medium truncate opacity-90">
                  {mappedBeforeOrg.name}
                </span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => clearComparisonOrgMap(mappedBeforeOrgId!)}
                  className="text-[9px] text-white opacity-60 hover:opacity-100 flex-shrink-0"
                  title="マッピングを解除"
                >✕</button>
              </>
            ) : (
              <span className="text-[9px] text-white opacity-50 italic">
                ← 旧組織をドロップしてマッピング
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 子組織モードセレクター ────────────────────────────────── */}
      {panel.open && hasChildren && (
        <div className="flex-shrink-0 flex bg-gray-100 border-b border-gray-200" style={{ height: 24 }}>
          {MODES.map(({ key, icon, label, title }) => {
            const active = panel.childrenMode === key
            return (
              <button
                key={key}
                onClick={() => setChildrenMode(panel.id, key)}
                title={title}
                className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-medium border-r last:border-r-0 border-gray-200 transition-colors ${
                  active
                    ? 'bg-white text-gray-800'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── ボディ ───────────────────────────────────────────────── */}
      {panel.open && (
        <div className="overflow-y-auto p-1.5" style={{ maxHeight: MAX_BODY_H }}>
          {currentOrg ? (
            <TreeNode
              key={currentRootId}
              orgId={currentRootId}
              panelId={panel.id}
              onNavigate={navigateTo}
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
