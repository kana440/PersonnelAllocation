import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { CanvasLayout }             from '../canvas/CanvasLayout'
import { FloatingEditor }           from './FloatingEditor'
import { HistoryPanel }             from '../history/HistoryPanel'
import { MaintenanceDialog }        from '../maintenanceDialog'
import { MasterBrowserPanel }       from '../masterBrowser'
import { StrictnessSettingsPanel }  from '../settings/StrictnessSettingsPanel'
import { ReviewPane }               from './ReviewPane'
import { OrgPersonNav }             from '../layout/OrgPersonNav'
import { FloatingAIChat }           from '../layout/FloatingAIChat'
import { useStore }                 from '../../store/useStore'
import { useCanvasLayoutStore }     from '../../store/canvasLayoutStore'
import { useCanvasDisplayStore }    from '../../store/canvasDisplayStore'
import { useReviewFilterStore }     from '../../store/reviewFilterStore'
import { useUICommandStore }        from '../../store/uiCommandStore'
import { useResizablePanel }        from '../../hooks/useResizablePanel'
import { toAllocationRows }         from '../../infrastructure/allocationListMapper'
import { exportToXlsx }            from '../../infrastructure/excel/engine'
import { COMPACT_GROUP_DEFS }       from '../canvas/panel/compactGroupDefs'

type MainViewMode = 'canvas' | 'review'

const NAV_MIN = 160; const NAV_MAX = 480; const NAV_DEFAULT = 280
const HISTORY_MIN = 160; const HISTORY_MAX = 400; const HISTORY_DEFAULT = 220

interface HeaderButtonProps {
  onClick:       () => void
  active?:       boolean
  activeClass?:  string
  disabled?:     boolean
  title?:        string
  children:      ReactNode
}

export function HeaderButton({
  onClick, active, activeClass = 'bg-blue-600 text-white', disabled, title, children,
}: HeaderButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? activeClass : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

interface Props {
  headerLeft:  ReactNode
  headerMid?:  ReactNode
  headerRight: ReactNode
  topBanner?:  ReactNode
}

export function EditViewCore({ headerLeft, headerMid, headerRight, topBanner }: Props) {
  const undo           = useStore(s => s.undo)
  const redo           = useStore(s => s.redo)
  const canUndo        = useStore(s => s.canUndo)
  const canRedo        = useStore(s => s.canRedo)
  const masterWarnings = useStore(s => s.masterWarnings)

  // export 用
  const allocationList      = useStore(s => s.allocationList)
  const afterOrganizations  = useStore(s => s.afterOrganizations)
  const beforeOrganizations = useStore(s => s.beforeOrganizations)
  const effectiveDate       = useStore(s => s.effectiveDate)

  // ── ビュー操作（組織図） ─────────────────────────────────────────
  const canvasPanelStyle    = useCanvasLayoutStore(s => s.canvasPanelStyle)
  const setCanvasPanelStyle = useCanvasLayoutStore(s => s.setCanvasPanelStyle)
  const comparisonMode      = useCanvasLayoutStore(s => s.comparisonMode)
  const toggleComparisonMode = useCanvasLayoutStore(s => s.toggleComparisonMode)
  const compactGroupById    = useCanvasDisplayStore(s => s.compactGroupById)
  const setCompactGroupById = useCanvasDisplayStore(s => s.setCompactGroupById)

  // スタイル切替後、フォーカス中の行または組織にスクロール
  const prevStyleRef = useRef<string>(canvasPanelStyle)
  useEffect(() => {
    if (prevStyleRef.current === canvasPanelStyle) return
    prevStyleRef.current = canvasPanelStyle
    const { selectedCardRowId, focusedOrgId } = useStore.getState()
    const layoutStore = useCanvasLayoutStore.getState()
    if (selectedCardRowId !== null) {
      layoutStore.requestScrollToRow(selectedCardRowId)
    } else if (focusedOrgId) {
      layoutStore.requestScrollToOrg(focusedOrgId)
    }
  }, [canvasPanelStyle])

  // ── ビュー操作（表形式） ─────────────────────────────────────────
  const viewMode    = useReviewFilterStore(s => s.viewMode)
  const setViewMode = useReviewFilterStore(s => s.setViewMode)

  const [mainViewMode,           setMainViewMode]           = useState<MainViewMode>('canvas')
  const [isHistoryOpen,          setIsHistoryOpen]          = useState(false)
  const [maintenanceOpen,        setMaintenanceOpen]        = useState(false)
  const [masterBrowserOpen,      setMasterBrowserOpen]      = useState(false)
  const [strictnessSettingsOpen, setStrictnessSettingsOpen] = useState(false)
  const [settingsMenuOpen,       setSettingsMenuOpen]       = useState(false)

  const settingsRef = useRef<HTMLDivElement>(null)


  const [navWidth,     , handleNavResizeStart]     = useResizablePanel(NAV_DEFAULT,     { min: NAV_MIN,     max: NAV_MAX,     axis: 'x' })
  const [historyWidth, , handleHistoryResizeStart] = useResizablePanel(HISTORY_DEFAULT, { min: HISTORY_MIN, max: HISTORY_MAX, axis: 'x', invert: true })

  // 設定ドロップダウンのクリック外クローズ
  useEffect(() => {
    if (!settingsMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsMenuOpen])

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof Element) {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if ((e.target as HTMLElement).isContentEditable) return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (canUndo) undo() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (canRedo) redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, canUndo, canRedo])

  // AI からの setMainViewMode コマンドを受け取る
  const uiCommand      = useUICommandStore(s => s.command)
  const clearUICommand = useUICommandStore(s => s.clear)
  useEffect(() => {
    if (uiCommand?.type !== 'setMainViewMode') return
    if (uiCommand.mode === 'review') {
      const { selectedCardRowId, selectedOrgId } = useStore.getState()
      const filterStore = useReviewFilterStore.getState()
      filterStore.setPendingScrollRowId(selectedCardRowId)
      if (!selectedCardRowId && selectedOrgId) filterStore.setPendingScrollOrgId(selectedOrgId)
    }
    setMainViewMode(uiCommand.mode)
    clearUICommand()
  }, [uiCommand, clearUICommand])

  const handleDoubleClick = useCallback((_rowId: number) => {
    setMainViewMode('canvas')
  }, [])

  // エクスポート
  const allOrgs = useMemo(() => {
    const beforeIds = new Set(beforeOrganizations.map(o => o.id))
    return [
      ...beforeOrganizations,
      ...afterOrganizations.filter(o => !beforeIds.has(o.id)),
    ]
  }, [beforeOrganizations, afterOrganizations])

  const handleExport = useCallback(() => {
    const rows = toAllocationRows(allocationList, allOrgs)
    exportToXlsx(rows, effectiveDate)
  }, [allocationList, allOrgs, effectiveDate])

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">

      {/* ── トップバー ── */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        {headerLeft}
        {headerMid}
        <div className="ml-auto flex items-center gap-2">
          <HeaderButton onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
            <span>&#x21A9;</span><span>Undo</span>
          </HeaderButton>
          <HeaderButton onClick={redo} disabled={!canRedo} title="やり直し (Ctrl+Y)">
            <span>Redo</span><span>&#x21AA;</span>
          </HeaderButton>
          <div className="w-px h-4 bg-gray-600" />
          <HeaderButton
            onClick={() => setIsHistoryOpen(o => !o)}
            active={isHistoryOpen}
            activeClass="bg-indigo-600 text-white"
            title="操作履歴パネル"
          >
            <span>&#x23F1;</span><span>履歴</span>
          </HeaderButton>
          <HeaderButton
            onClick={() => setMasterBrowserOpen(o => !o)}
            active={masterBrowserOpen}
            title="コードリスト・組織マスタなどのテーブルを照会"
          >
            <span>📋</span><span>テーブル参照</span>
            {masterWarnings.length > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {masterWarnings.length > 9 ? '9+' : masterWarnings.length}
              </span>
            )}
          </HeaderButton>

          {/* ⚙設定ドロップダウン（入力制約 + 自動補完） */}
          <div ref={settingsRef} className="relative">
            <HeaderButton
              onClick={() => setSettingsMenuOpen(o => !o)}
              active={settingsMenuOpen || strictnessSettingsOpen || maintenanceOpen}
              title="入力制約・自動補完などの設定"
            >
              <span>⚙</span><span>設定</span>
            </HeaderButton>
            {settingsMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-max">
                <button
                  onClick={() => { setStrictnessSettingsOpen(true); setSettingsMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2 rounded-t"
                >
                  <span>🔒</span><span>入力制約</span>
                </button>
                <button
                  onClick={() => { setMaintenanceOpen(true); setSettingsMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2 rounded-b"
                >
                  <span>🔧</span><span>自動補完</span>
                </button>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-gray-600" />
          {headerRight}
        </div>
      </header>

      {topBanner}

      {/* ── ビュー切替バー ── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white flex items-center px-2">
        <div className="flex">
          {([
            { mode: 'canvas', label: '🗺 組織図' },
            { mode: 'review', label: '📊 表形式' },
          ] as const).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === 'review') {
                  // 表形式マウント前にスクロール先を確定しておく（ペイント前に反映するため）
                  const { selectedCardRowId, selectedOrgId } = useStore.getState()
                  const filterStore = useReviewFilterStore.getState()
                  filterStore.setPendingScrollRowId(selectedCardRowId)
                  if (!selectedCardRowId && selectedOrgId) filterStore.setPendingScrollOrgId(selectedOrgId)
                }
                setMainViewMode(mode)
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mainViewMode === mode
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >{label}</button>
          ))}
        </div>
        {/* ── コンテキスト依存のビュー操作 ── */}
        <div className="flex items-center gap-2 ml-4">
          {mainViewMode === 'canvas' && (
            <>
              {/* ツリー / コンパクト */}
              <div className="flex items-stretch border border-gray-300 rounded overflow-hidden text-xs font-medium">
                {([
                  { id: 'tree', label: 'ツリー' },
                  { id: 'band', label: 'コンパクト' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setCanvasPanelStyle(id)}
                    className={`px-2.5 py-1 transition-colors ${
                      canvasPanelStyle === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >{label}</button>
                ))}
              </div>
              {/* コンパクト時のグループ単位 */}
              {canvasPanelStyle === 'band' && (
                <select
                  value={compactGroupById}
                  onChange={e => setCompactGroupById(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-600 cursor-pointer"
                  title="コンパクトビューのグループ単位"
                >
                  {COMPACT_GROUP_DEFS.map(d => (
                    <option key={d.id} value={d.id}>{d.label}別</option>
                  ))}
                </select>
              )}
              {/* 旧体制との比較 */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-gray-600 px-1">
                <input
                  type="checkbox"
                  checked={comparisonMode}
                  onChange={toggleComparisonMode}
                  className="accent-indigo-600 w-3.5 h-3.5"
                />
                旧体制と比較
              </label>
            </>
          )}
          {mainViewMode === 'review' && (
            /* 比較形式 / Excel形式 */
            <div className="flex items-stretch border border-gray-300 rounded overflow-hidden text-xs font-medium">
              {([
                { id: 'diff',          label: '比較形式' },
                { id: 'side-by-side',  label: 'Excel形式' },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`px-2.5 py-1 transition-colors ${
                    viewMode === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto pr-1">
          <button
            onClick={handleExport}
            disabled={allocationList.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
        </div>
      </div>

      {maintenanceOpen        && <MaintenanceDialog        onClose={() => setMaintenanceOpen(false)} />}
      {masterBrowserOpen      && <MasterBrowserPanel       onClose={() => setMasterBrowserOpen(false)} />}
      {strictnessSettingsOpen && <StrictnessSettingsPanel  onClose={() => setStrictnessSettingsOpen(false)} />}

      {/* メインエリア */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5">

        {/* 左: OrgPersonNav — 組織図モードのみ表示（右端ハンドルでリサイズ可） */}
        {mainViewMode === 'canvas' && (
          <div
            className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative"
            style={{ width: navWidth }}
          >
            <div
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 active:bg-blue-400 transition-colors z-10"
              onMouseDown={handleNavResizeStart}
              title="ドラッグで幅を調整"
            />
            <OrgPersonNav onDoubleClick={handleDoubleClick} />
          </div>
        )}

        {/* 右: 組織図 または 表形式（全幅） */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          {mainViewMode === 'canvas' ? (
            <CanvasLayout />
          ) : (
            <ReviewPane />
          )}
        </div>

        {/* 履歴パネル（折りたたみ式） */}
        {isHistoryOpen ? (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: historyWidth }}>
            <div className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-10" onMouseDown={handleHistoryResizeStart} />
            <HistoryPanel onClose={() => setIsHistoryOpen(false)} />
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-indigo-50 transition-colors"
            onClick={() => setIsHistoryOpen(true)}
            title="操作履歴を展開"
          >
            <span className="text-gray-400 text-xs">&#x25C4;</span>
            <span className="text-xs font-semibold text-indigo-600" style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}>履歴</span>
          </div>
        )}
      </div>

      <FloatingEditor />
      <FloatingAIChat />
    </div>
  )
}
