import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { CanvasLayout }  from '../canvas/CanvasLayout'
import { FloatingEditor } from './FloatingEditor'
import { HistoryPanel }  from '../history/HistoryPanel'
import { MaintenanceDialog }        from '../maintenanceDialog'
import { MasterBrowserPanel }     from '../masterBrowser'
import { StrictnessSettingsPanel }  from '../settings/StrictnessSettingsPanel'
import { ReviewPane }               from './ReviewPane'
import { OrgPersonNav }             from '../layout/OrgPersonNav'
import { FloatingAIChat }           from '../layout/FloatingAIChat'
import { useStore }          from '../../store/useStore'
import { useResizablePanel } from '../../hooks/useResizablePanel'

/**
 * メイン表示モード:
 *   'canvas' — 左:OrgPersonNav + 右:CanvasLayout（組織図）
 *   'review' — 全幅 ReviewPane（詳細表 Before/After）
 */
type MainViewMode = 'canvas' | 'review'

const STRIP_W     = 280
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

  const [mainViewMode,           setMainViewMode]           = useState<MainViewMode>('canvas')
  const [isHistoryOpen,          setIsHistoryOpen]          = useState(false)
  const [maintenanceOpen,        setMaintenanceOpen]        = useState(false)
  const [masterBrowserOpen,      setMasterBrowserOpen]      = useState(false)
  const [strictnessSettingsOpen, setStrictnessSettingsOpen] = useState(false)

  const [historyWidth, , handleHistoryResizeStart] = useResizablePanel(HISTORY_DEFAULT, { min: HISTORY_MIN, max: HISTORY_MAX, axis: 'x', invert: true })

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

  // Canvas でカードをダブルクリック → 操作パネルが開くので Canvas モードに留まる
  const handleDoubleClick = useCallback((_rowId: number) => {
    setMainViewMode('canvas')
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">

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

          {/* Canvas / 詳細表（ReviewPane）切替 */}
          <div className="flex rounded overflow-hidden border border-gray-600">
            <button
              onClick={() => setMainViewMode('canvas')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mainViewMode === 'canvas'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="組織図キャンバス"
            >
              🗺 Canvas
            </button>
            <button
              onClick={() => setMainViewMode('review')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mainViewMode === 'review'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="詳細レビュー表（Before/After全列）"
            >
              📊 詳細表
            </button>
          </div>

          <div className="w-px h-4 bg-gray-600" />
          <HeaderButton
            onClick={() => setIsHistoryOpen(o => !o)}
            active={isHistoryOpen}
            activeClass="bg-indigo-600 text-white"
            title="操作履歴パネル"
          >
            <span>&#x23F1;</span><span>履歴</span>
          </HeaderButton>
          <div className="w-px h-4 bg-gray-600" />
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
          <HeaderButton
            onClick={() => setStrictnessSettingsOpen(o => !o)}
            active={strictnessSettingsOpen}
            title="フィールドごとの選択肢の厳密さ設定"
          >
            <span>⚙</span><span>入力制約</span>
          </HeaderButton>
          <HeaderButton
            onClick={() => setMaintenanceOpen(true)}
            title="上司姓名再導出・組織サブフィールド再導出・ポジションコード割当などのメンテナンス処理"
          >
            <span>🔧</span><span>メンテナンス</span>
          </HeaderButton>
          <div className="w-px h-4 bg-gray-600" />
          {headerRight}
        </div>
      </header>

      {topBanner}

      {maintenanceOpen        && <MaintenanceDialog        onClose={() => setMaintenanceOpen(false)} />}
      {masterBrowserOpen      && <MasterBrowserPanel       onClose={() => setMasterBrowserOpen(false)} />}
      {strictnessSettingsOpen && <StrictnessSettingsPanel  onClose={() => setStrictnessSettingsOpen(false)} />}

      {/* メインエリア */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5">

        {/* 左: OrgPersonNav — Canvas モードのみ表示 */}
        {mainViewMode === 'canvas' && (
          <div
            className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col"
            style={{ width: STRIP_W }}
          >
            <OrgPersonNav onDoubleClick={handleDoubleClick} />
          </div>
        )}

        {/* 右: Canvas（組織図） または ReviewPane（詳細表・全幅） */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          {mainViewMode === 'canvas' ? (
            <CanvasLayout />
          ) : (
            <ReviewPane onBackToCanvas={() => setMainViewMode('canvas')} />
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
