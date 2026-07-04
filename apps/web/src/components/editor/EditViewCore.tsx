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
import { useResizablePanel }        from '../../hooks/useResizablePanel'
import { toAllocationRows }         from '../../infrastructure/allocationListMapper'
import { exportToXlsx }            from '../../infrastructure/excel/engine'

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
              onClick={() => setMainViewMode(mode)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mainViewMode === mode
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >{label}</button>
          ))}
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
