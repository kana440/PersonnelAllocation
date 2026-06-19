import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useOrgView }            from '../OrgViewContext'
import { subtreeRowCount, hasAnyRows } from '../panel/helpers'
import { useCanvasLayoutStore }  from '../../../store/canvasLayoutStore'
import type { PanelDef }        from '../../../store/canvasLayoutStore'
import { TreeNode }              from './TreeNode'
import { AddRowDropdown }        from '../AddRowDropdown'
import { useStore }              from '../../../store/useStore'
import { isSecondmentOrg }      from '@personnel/domain/derivation'
import { parseOrgMappingDrag }  from '../comparison/BeforeOrgWindow'
import type { Organization }     from '@personnel/domain/schemas'
import type { PositionEntry }    from '../OrgViewContext'

function getDescendantOrgIds(
  rootId:    string,
  orgs:      Organization[],
  posTree:   Map<string, PositionEntry[]>,
  directOnly = false,
): string[] {
  const direct = orgs.filter(
    o => o.parentId === rootId && hasAnyRows(o.id, orgs, posTree),
  )
  if (directOnly) return direct.map(o => o.id)
  const result: string[] = []
  for (const child of direct) {
    result.push(child.id)
    result.push(...getDescendantOrgIds(child.id, orgs, posTree))
  }
  return result
}

const MAX_BODY_H = 1600

interface TreeWindowProps {
  panel: PanelDef
}

// ── iOS風トグルスイッチ（視覚のみ・クリックは親要素が担当）─────────
function ToggleTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors"
      style={{ background: on ? '#3b82f6' : '#d1d5db' }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
        style={{ left: 2, transform: on ? 'translateX(12px)' : 'translateX(0px)' }}
      />
    </span>
  )
}

export function TreeWindow({ panel }: TreeWindowProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const {
    panels,
    setPosition, toggleOpen, setChildrenMode,
    addPanel, setOrgOpen, setCollapsedOrgIds,
    comparisonMode, comparisonOrgMapping, setComparisonOrgMap, clearComparisonOrgMap,
  } = useCanvasLayoutStore()
  const codeLists           = useStore(s => s.codeLists)
  const beforeOrganizations = useStore(s => s.beforeOrganizations)

  // ── ヘッダー色 ─────────────────────────────────────────────────
  const org = organizations.find(o => o.id === panel.orgId)
  const hasRows      = subtreeRowCount(panel.orgId, organizations, positionTreeByOrgId) > 0
  const isSecondment = org?.externalCode
    ? isSecondmentOrg(org.externalCode, codeLists)
    : false
  const headerBg = isSecondment ? '#2e7d52' : !hasRows ? '#b54520' : '#3c7abf'

  // ── 比較マッピング ─────────────────────────────────────────────
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

  const onTitleDragLeave = useCallback(() => { setMappingDragOver(false) }, [])

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

  const navigateTo = useCallback((childOrgId: string) => {
    setRootPath(prev => [...prev, childOrgId])
    setCollapsedOrgIds(panel.id, [])  // ナビ先では全展開
  }, [panel.id, setCollapsedOrgIds])

  const navigateToIdx = useCallback((idx: number) => {
    setRootPath(prev => prev.slice(0, idx + 1))
    setCollapsedOrgIds(panel.id, [])
  }, [panel.id, setCollapsedOrgIds])

  // ── リストモード: 折りたたみ状態はストアで管理 ────────────────
  const collapsedOrgs = useMemo(
    () => new Set(panel.collapsedOrgIds),
    [panel.collapsedOrgIds],
  )

  const onOrgCollapse = useCallback((id: string) => {
    setCollapsedOrgIds(panel.id, [...panel.collapsedOrgIds, id])
  }, [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds])

  const onOrgExpand = useCallback((id: string) => {
    setCollapsedOrgIds(panel.id, panel.collapsedOrgIds.filter(x => x !== id))
  }, [panel.id, panel.collapsedOrgIds, setCollapsedOrgIds])

  // ── 深さコントロール ──────────────────────────────────────────
  const handleCollapseAll = useCallback(() => {
    const ids = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId)
    if (panel.childrenMode === 'windowed') {
      ids.forEach(id => setOrgOpen(id, false))
    } else {
      setCollapsedOrgIds(panel.id, ids)
    }
  }, [currentRootId, organizations, positionTreeByOrgId, panel, setOrgOpen, setCollapsedOrgIds])

  const handleExpandChildren = useCallback(() => {
    const directChildIds = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId, true)
    if (panel.childrenMode === 'windowed') {
      // 直接の子だけウィンドウを開く。子の中身はリスト・全たたみ
      directChildIds.forEach(id => {
        const allDesc = getDescendantOrgIds(id, organizations, positionTreeByOrgId)
        const existing = panels.find(p => p.orgId === id)
        if (existing) {
          setOrgOpen(id, true)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
    } else {
      // 直接の子だけ展開・孫以降はたたむ
      const direct = new Set(directChildIds)
      const all    = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId)
      setCollapsedOrgIds(panel.id, all.filter(id => !direct.has(id)))
    }
  }, [currentRootId, organizations, positionTreeByOrgId, panel, panels, addPanel, setOrgOpen, setChildrenMode, setCollapsedOrgIds])

  const handleExpandAll = useCallback(() => {
    const ids = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId)
    if (panel.childrenMode === 'windowed') {
      // 全子孫を個別ウィンドウで開く。個別モードを伝播
      ids.forEach(id => {
        const existing = panels.find(p => p.orgId === id)
        if (existing) {
          setOrgOpen(id, true)
          setChildrenMode(existing.id, 'windowed')
        } else {
          addPanel(id, { childrenMode: 'windowed' })
        }
      })
    } else {
      setCollapsedOrgIds(panel.id, [])
    }
  }, [currentRootId, organizations, positionTreeByOrgId, panel, panels, addPanel, setOrgOpen, setChildrenMode, setCollapsedOrgIds])

  // ── リスト↔個別 トグル ────────────────────────────────────────
  // 切り替え時は常に「子のみ展開」状態にする（対称的な動作）
  const handleToggleIndividualMode = useCallback(() => {
    const directChildIds = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId, true)
    const allIds         = getDescendantOrgIds(currentRootId, organizations, positionTreeByOrgId)

    if (panel.childrenMode === 'windowed') {
      // 個別 → リスト: 子のみ展開・孫以降はたたむ
      const direct = new Set(directChildIds)
      setCollapsedOrgIds(panel.id, allIds.filter(id => !direct.has(id)))
      allIds.forEach(id => setOrgOpen(id, false))
      setChildrenMode(panel.id, 'inline')
    } else {
      // リスト → 個別: 直接の子だけウィンドウを開く。子の中身はリスト・全たたみ
      directChildIds.forEach(id => {
        const allDesc = getDescendantOrgIds(id, organizations, positionTreeByOrgId)
        const existing = panels.find(p => p.orgId === id)
        if (existing) {
          setOrgOpen(id, true)
          setChildrenMode(existing.id, 'inline')
          setCollapsedOrgIds(existing.id, allDesc)
        } else {
          addPanel(id, { childrenMode: 'inline', collapsedOrgIds: allDesc })
        }
      })
      setChildrenMode(panel.id, 'windowed')
    }
  }, [panel, panels, currentRootId, organizations, positionTreeByOrgId, setCollapsedOrgIds, setOrgOpen, setChildrenMode, addPanel])

  // ──
  const currentOrg  = organizations.find(o => o.id === currentRootId)
  const totalCount  = subtreeRowCount(currentRootId, organizations, positionTreeByOrgId)
  const isDragOver  = dragOverOrgId === currentRootId
  const isContained = panel.childrenMode === 'inline'

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
        <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
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
            <AddRowDropdown orgCode={currentOrg?.externalCode ?? ''} variant="header" />
          </div>
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

        {comparisonMode && (
          <div className="flex items-center gap-1 px-2 pb-0.5" style={{ minHeight: 16 }}>
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

      {/* ── コントロールバー ─────────────────────────────────────── */}
      {panel.open && hasChildren && (
        <div className="flex-shrink-0 flex items-stretch bg-gray-50 border-b border-gray-200" style={{ height: 24 }}>
          {/* 深さ制御 3ボタン */}
          {([
            { label: 'たたむ', onClick: handleCollapseAll,    title: 'すべての子組織を折りたたむ' },
            { label: '子のみ', onClick: handleExpandChildren, title: '直接の子だけ展開（孫はたたむ）' },
            { label: '全展開', onClick: handleExpandAll,      title: 'すべての子孫を展開' },
          ] as const).map(({ label, onClick, title }) => (
            <button
              key={label}
              onClick={onClick}
              title={title}
              className="flex-1 text-[9px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-r border-gray-200 transition-colors"
            >
              {label}
            </button>
          ))}

          {/* セパレーター */}
          <div className="w-px bg-gray-200 flex-shrink-0" />

          {/* 包含モード トグル */}
          <button
            role="switch"
            aria-checked={isContained}
            onClick={handleToggleIndividualMode}
            title={isContained
              ? '包含モード: 子組織をこの中に表示（クリックで個別に切り替え）'
              : '個別モード: 子組織を別ウィンドウで表示（クリックで包含に切り替え）'}
            className="flex items-center gap-1.5 px-2.5 flex-shrink-0 h-full hover:bg-gray-100 transition-colors"
          >
            <span className={`text-[9px] font-medium transition-colors ${isContained ? 'text-blue-600' : 'text-gray-400'}`}>
              包含
            </span>
            <ToggleTrack on={isContained} />
          </button>
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
              collapsedOrgs={collapsedOrgs}
              onOrgCollapse={onOrgCollapse}
              onOrgExpand={onOrgExpand}
            />
          ) : (
            <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
          )}
        </div>
      )}
    </div>
  )
}
