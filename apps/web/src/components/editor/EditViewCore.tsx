import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { LeftSidebar }   from '../sidebar/LeftSidebar'
import { CanvasLayout }  from '../canvas/CanvasLayout'
import { FloatingEditor } from './FloatingEditor'
import { HistoryPanel }  from '../history/HistoryPanel'
import { BottomPanel }   from './BottomPanel'
import { AIChatDrawer }  from '../ai/AIChatDrawer'
import { MaintenanceDialog }        from '../maintenanceDialog'
import { MasterBrowserPanel }     from '../masterBrowser'
import { StrictnessSettingsPanel }  from '../settings/StrictnessSettingsPanel'
import { useStore }          from '../../store/useStore'
import { useResizablePanel } from '../../hooks/useResizablePanel'

const BOTTOM_MIN       = 36
const BOTTOM_MAX_RATIO = 0.65
const BOTTOM_DEFAULT   = 220
const BOTTOM_COLLAPSED = 36

const SIDEBAR_MIN = 140;  const SIDEBAR_MAX = 480;  const SIDEBAR_DEFAULT = 192
const CHAT_MIN    = 240;  const CHAT_MAX    = 600;  const CHAT_DEFAULT    = 320
const HISTORY_MIN = 160;  const HISTORY_MAX = 400;  const HISTORY_DEFAULT = 220

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
  /** タイトルエリア（← 戻るボタン・アプリ名・スコープ等） */
  headerLeft:  ReactNode
  /** STEP1 専用の中間ボタン群（マージ・担当者割当・分割エクスポート等） */
  headerMid?:  ReactNode
  /** 右端のアクションボタン（STEP1: 管理+クリア、STEP2: 提出） */
  headerRight: ReactNode
  /** ヘッダー直下のバナー（STEP2 の差し戻しコメント等） */
  topBanner?:  ReactNode
}

export function EditViewCore({ headerLeft, headerMid, headerRight, topBanner }: Props) {
  const { undo, redo, canUndo, canRedo, selectedPersonId, masterWarnings } = useStore()

  const [isTreeOpen,    setIsTreeOpen]    = useState(true)
  const [isChatOpen,    setIsChatOpen]    = useState(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [excelCollapsed,         setExcelCollapsed]         = useState(false)
  const [maintenanceOpen,        setMaintenanceOpen]        = useState(false)
  const [masterBrowserOpen,    setMasterBrowserOpen]    = useState(false)
  const [strictnessSettingsOpen, setStrictnessSettingsOpen] = useState(false)

  const prevBottomHeightRef = useRef(BOTTOM_DEFAULT)

  const [sidebarWidth,  , handleSidebarResizeStart]  = useResizablePanel(SIDEBAR_DEFAULT, { min: SIDEBAR_MIN,  max: SIDEBAR_MAX,  axis: 'x' })
  const [chatWidth,     , handleChatResizeStart]     = useResizablePanel(CHAT_DEFAULT,    { min: CHAT_MIN,     max: CHAT_MAX,     axis: 'x', invert: true })
  const [historyWidth,  , handleHistoryResizeStart]  = useResizablePanel(HISTORY_DEFAULT, { min: HISTORY_MIN,  max: HISTORY_MAX,  axis: 'x', invert: true })
  const [bottomHeight, setBottomHeight, handleResizeStart] = useResizablePanel(
    BOTTOM_DEFAULT,
    { min: BOTTOM_MIN, max: () => window.innerHeight * BOTTOM_MAX_RATIO, axis: 'y', invert: true },
  )

  const toggleExcelCollapse = useCallback(() => {
    if (excelCollapsed) {
      setBottomHeight(prevBottomHeightRef.current)
      setExcelCollapsed(false)
    } else {
      prevBottomHeightRef.current = bottomHeight > BOTTOM_COLLAPSED ? bottomHeight : BOTTOM_DEFAULT
      setBottomHeight(BOTTOM_COLLAPSED)
      setExcelCollapsed(true)
    }
  }, [excelCollapsed, bottomHeight, setBottomHeight])

  // Canvas でメンバーを選択したとき折りたたまれていれば自動展開
  useEffect(() => {
    if (!selectedPersonId) return
    if (excelCollapsed) {
      setBottomHeight(prevBottomHeightRef.current > BOTTOM_COLLAPSED ? prevBottomHeightRef.current : BOTTOM_DEFAULT)
      setExcelCollapsed(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId])

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

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">

      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        {headerLeft}
        {headerMid}
        <div className="ml-auto flex items-center gap-2">
          <HeaderButton onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
            <span>↩</span><span>Undo</span>
          </HeaderButton>
          <HeaderButton onClick={redo} disabled={!canRedo} title="やり直し (Ctrl+Y)">
            <span>Redo</span><span>↪</span>
          </HeaderButton>
          <div className="w-px h-4 bg-gray-600" />
          <HeaderButton
            onClick={toggleExcelCollapse}
            active={!excelCollapsed}
            activeClass="bg-emerald-600 text-white"
            title="レビューパネルを開閉する"
          >
            <span>🔍</span><span>レビュー</span>
          </HeaderButton>
          <HeaderButton
            onClick={() => setIsHistoryOpen(o => !o)}
            active={isHistoryOpen}
            activeClass="bg-indigo-600 text-white"
            title="操作履歴パネル"
          >
            <span>⏱</span><span>履歴</span>
          </HeaderButton>
          <HeaderButton onClick={() => setIsChatOpen(o => !o)} active={isChatOpen}>
            <span>💬</span><span>AI アシスタント</span>
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
      {masterBrowserOpen    && <MasterBrowserPanel     onClose={() => setMasterBrowserOpen(false)} />}
      {strictnessSettingsOpen && <StrictnessSettingsPanel  onClose={() => setStrictnessSettingsOpen(false)} />}

      {/* 上段: サイドバー + キャンバス + AI チャット + 履歴 */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5 pb-0">

        {isTreeOpen ? (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: sidebarWidth }}>
            <LeftSidebar />
            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 transition-colors z-10" onMouseDown={handleSidebarResizeStart} />
          </div>
        ) : (
          <div className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => setIsTreeOpen(true)} title="サイドバーを展開">
            <span className="text-gray-400 text-xs">▶</span>
            <span className="text-xs font-semibold text-blue-600" style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}>組織</span>
          </div>
        )}

        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          <CanvasLayout />
        </div>

        {isChatOpen && (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: chatWidth }}>
            <div className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 transition-colors z-10" onMouseDown={handleChatResizeStart} />
            <AIChatDrawer onClose={() => setIsChatOpen(false)} />
          </div>
        )}

        {isHistoryOpen ? (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: historyWidth }}>
            <div className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-10" onMouseDown={handleHistoryResizeStart} />
            <HistoryPanel onClose={() => setIsHistoryOpen(false)} />
          </div>
        ) : (
          <div className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => setIsHistoryOpen(true)} title="操作履歴を展開">
            <span className="text-gray-400 text-xs">◀</span>
            <span className="text-xs font-semibold text-indigo-600" style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}>履歴</span>
          </div>
        )}
      </div>

      {/* リサイズハンドル */}
      <div className="h-2 flex-shrink-0 mx-1.5 flex items-center justify-center cursor-row-resize group" onMouseDown={handleResizeStart}>
        <div className="w-full h-1 bg-gray-300 rounded group-hover:bg-blue-400 transition-colors" />
      </div>

      {/* 下段: レビュー/履歴パネル */}
      <div className="flex-shrink-0 bg-white rounded-lg shadow mx-1.5 mb-1.5 overflow-hidden" style={{ height: excelCollapsed ? BOTTOM_COLLAPSED : bottomHeight }}>
        <BottomPanel isCollapsed={excelCollapsed} onToggleCollapse={toggleExcelCollapse} />
      </div>

      <FloatingEditor />
    </div>
  )
}
