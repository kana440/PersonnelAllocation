import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AdminView }          from './components/admin/AdminView'
import { Features }           from './config/features'
import { LeftSidebar }        from './components/sidebar/LeftSidebar'
import { CanvasLayout }        from './components/canvas/CanvasLayout'
import { FloatingEditor }    from './components/editor/FloatingEditor'
import { HistoryPanel }      from './components/history/HistoryPanel'
import { BottomPanel }       from './components/editor/BottomPanel'
import { AIChatDrawer }      from './components/ai/AIChatDrawer'
import { AIView }            from './components/ai/AIView'
import { SetupView }         from './components/setup/SetupView'
import { ClearSessionDialog } from './components/common/ClearSessionDialog'
import { MaintenanceDialog }  from './components/maintenanceDialog'
import { useStore }          from './store/useStore'
import { useUserSession }    from './store/useUserSession'
import { useCodeListStore }  from './store/codeListStore'
import { ScopeSelector }          from './components/header/ScopeSelector'
import { MergeImportButton }      from './components/header/MergeImportButton'
import { AssigneeWizard }         from './components/header/AssigneeWizard'
import { SplitExportButton }      from './components/header/SplitExportButton'
import { CodeListBrowserPanel }      from './components/codelistBrowser'
import { StrictnessSettingsPanel }   from './components/settings/StrictnessSettingsPanel'
import { useResizablePanel } from './hooks/useResizablePanel'

const BOTTOM_MIN        = 36
const BOTTOM_MAX_RATIO  = 0.65
const BOTTOM_DEFAULT    = 220
const BOTTOM_COLLAPSED  = 36


const SIDEBAR_MIN     = 140
const SIDEBAR_MAX     = 480
const SIDEBAR_DEFAULT = 192

const CHAT_MIN     = 240
const CHAT_MAX     = 600
const CHAT_DEFAULT = 320

const HISTORY_MIN     = 160
const HISTORY_MAX     = 400
const HISTORY_DEFAULT = 220

// ── 担当者割り当てウィザードボタン（管理者のみ表示）─────────────────────────
function AssigneeWizardButton({ onOpen }: { onOpen: () => void }) {
  const { capabilities } = useUserSession()
  if (!capabilities.canAssignAssignees) return null
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
      title="担当者を一括で割り当てる"
    >
      <span>👤</span><span>担当者を割り当て</span>
    </button>
  )
}

// ── 管理者用担当者プレビューフィルタ（管理者のみ表示）───────────────────────
function AdminAssigneeFilterSelect() {
  const { capabilities }  = useUserSession()
  const { allocationList, adminAssigneeFilter, setAdminAssigneeFilter } = useStore()
  const assignees = useMemo(() => {
    const names = new Set(allocationList.map(r => r.assignee).filter(Boolean) as string[])
    return [...names].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [allocationList])
  if (!capabilities.canSetAssigneeFilter || assignees.length === 0) return null
  return (
    <div className="flex items-center gap-1" title="担当者フィルタ（プレビュー）">
      <select
        value={adminAssigneeFilter ?? ''}
        onChange={e => setAdminAssigneeFilter(e.target.value || null)}
        className="text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-2 py-0.5 hover:bg-gray-600 focus:outline-none max-w-[120px]"
      >
        <option value="">全担当者</option>
        {assignees.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      {adminAssigneeFilter && (
        <button
          onClick={() => setAdminAssigneeFilter(null)}
          className="text-gray-400 hover:text-gray-200 text-xs leading-none"
          title="フィルタ解除"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── ヘッダーボタン ────────────────────────────────────────────────────────────
interface HeaderButtonProps {
  onClick: () => void
  active?: boolean
  activeClass?: string
  disabled?: boolean
  title?: string
  children: React.ReactNode
}
function HeaderButton({ onClick, active, activeClass = 'bg-blue-600 text-white', disabled, title, children }: HeaderButtonProps) {
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

export default function App() {
  const { isLoading, undo, redo, canUndo, canRedo, selectedPersonId } = useStore()
  const { isChecked, checkStorage } = useCodeListStore()

  const [appMode,      setAppMode]      = useState<'ai' | 'editor' | 'admin'>('ai')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => { checkStorage() }, [checkStorage])

  // エディタモードでデータ読み込み済みの場合、タブを閉じると警告を出す
  useEffect(() => {
    if (!sessionReady || appMode !== 'editor') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // Chrome/Edge で必要
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sessionReady, appMode])

  // Ctrl+Z / Cmd+Z → Undo、Ctrl+Y / Cmd+Shift+Z → Redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // input / textarea / select にフォーカスがある場合はブラウザデフォルトに委ねる
      if (e.target instanceof Element) {
        const tag = e.target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if ((e.target as HTMLElement).isContentEditable) return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const isUndo = e.key === 'z' && !e.shiftKey
      const isRedo = e.key === 'y' || (e.key === 'z' && e.shiftKey)

      if (isUndo) {
        e.preventDefault()
        if (canUndo) undo()
      } else if (isRedo) {
        e.preventDefault()
        if (canRedo) redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, canUndo, canRedo])

  const [isTreeOpen,        setIsTreeOpen]        = useState(true)
  const [isChatOpen,        setIsChatOpen]        = useState(true)
  const [isHistoryOpen,     setIsHistoryOpen]     = useState(false)
  const [clearDialogOpen,      setClearDialogOpen]      = useState(false)
  const [maintenanceOpen,      setMaintenanceOpen]      = useState(false)
  const [excelCollapsed,       setExcelCollapsed]       = useState(false)
  const [assigneeWizardOpen,   setAssigneeWizardOpen]   = useState(false)
  const [codeListBrowserOpen,   setCodeListBrowserOpen]   = useState(false)
  const [strictnessSettingsOpen, setStrictnessSettingsOpen] = useState(false)

  const prevBottomHeightRef = useRef(BOTTOM_DEFAULT)

  const [sidebarWidth,  , handleSidebarResizeStart]  = useResizablePanel(SIDEBAR_DEFAULT,  { min: SIDEBAR_MIN,  max: SIDEBAR_MAX,  axis: 'x' })
  const [chatWidth,     , handleChatResizeStart]     = useResizablePanel(CHAT_DEFAULT,     { min: CHAT_MIN,     max: CHAT_MAX,     axis: 'x', invert: true })
  const [historyWidth,  , handleHistoryResizeStart]  = useResizablePanel(HISTORY_DEFAULT,  { min: HISTORY_MIN,  max: HISTORY_MAX,  axis: 'x', invert: true })
  const [bottomHeight, setBottomHeight, handleResizeStart] = useResizablePanel(
    BOTTOM_DEFAULT,
    { min: BOTTOM_MIN, max: () => window.innerHeight * BOTTOM_MAX_RATIO, axis: 'y', invert: true }
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

  // Canvas でメンバーを選択したとき、折りたたまれていれば自動展開
  useEffect(() => {
    if (!selectedPersonId) return
    if (excelCollapsed) {
      setBottomHeight(prevBottomHeightRef.current > BOTTOM_COLLAPSED ? prevBottomHeightRef.current : BOTTOM_DEFAULT)
      setExcelCollapsed(false)
    }
  // excelCollapsed / setBottomHeight は意図的に依存から外す（選択時のみ発火）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId])

  if (!isChecked) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  if (appMode === 'admin') {
    return <AdminView onBack={() => setAppMode('ai')} />
  }

  if (appMode === 'ai') {
    return (
      <AIView
        onOpenEditor={() => setAppMode('editor')}
        onImportExcel={() => setAppMode('editor')}
        onDataLoaded={() => setSessionReady(true)}
      />
    )
  }

  if (!sessionReady) return <SetupView onReady={() => setSessionReady(true)} />

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-base font-bold tracking-tight">要員配置リスト編集</h1>
        <ScopeSelector />
        <div className="ml-auto flex items-center gap-2">
          <MergeImportButton />
          <AssigneeWizardButton onOpen={() => setAssigneeWizardOpen(true)} />
          <SplitExportButton />
          <AdminAssigneeFilterSelect />
          <div className="w-px h-4 bg-gray-600" />
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
          <HeaderButton
            onClick={() => setIsChatOpen(o => !o)}
            active={isChatOpen}
          >
            <span>💬</span><span>AI アシスタント</span>
          </HeaderButton>
          <div className="w-px h-4 bg-gray-600" />
          <HeaderButton
            onClick={() => setCodeListBrowserOpen(o => !o)}
            active={codeListBrowserOpen}
            title="コードリスト・組織マスタなどのテーブルを照会"
          >
            <span>📋</span><span>テーブル参照</span>
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
          <HeaderButton
            onClick={() => setAppMode('ai')}
            title="AI アシスタントに切り替え"
          >
            AI ←
          </HeaderButton>
          {Features.userManagement && (
            <HeaderButton
              onClick={() => setAppMode('admin')}
              title="管理画面（ユーザー管理・ポジション管理）"
            >
              <span>⚙</span><span>管理</span>
            </HeaderButton>
          )}
          <HeaderButton
            onClick={() => setClearDialogOpen(true)}
            activeClass="bg-red-700 text-white"
            title="セッションをクリアして最初から始める"
          >
            <span>↺</span><span>クリア</span>
          </HeaderButton>
        </div>
      </header>

      {clearDialogOpen && (
        <ClearSessionDialog
          onCleared={() => { setClearDialogOpen(false); setSessionReady(false) }}
          onCancel={() => setClearDialogOpen(false)}
        />
      )}

      {maintenanceOpen && (
        <MaintenanceDialog onClose={() => setMaintenanceOpen(false)} />
      )}

      {codeListBrowserOpen && (
        <CodeListBrowserPanel onClose={() => setCodeListBrowserOpen(false)} />
      )}

      {strictnessSettingsOpen && (
        <StrictnessSettingsPanel onClose={() => setStrictnessSettingsOpen(false)} />
      )}

      {assigneeWizardOpen && (
        <AssigneeWizard onClose={() => setAssigneeWizardOpen(false)} />
      )}

      {/* ── Upper area: sidebar + canvas + chat drawer ───────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5 pb-0">

        {/* Left sidebar — タブ切り替え（組織・人物 / 組織パネル） */}
        {isTreeOpen ? (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: sidebarWidth }}>
            <LeftSidebar />
            <div
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 transition-colors z-10"
              onMouseDown={handleSidebarResizeStart}
            />
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => setIsTreeOpen(true)}
            title="サイドバーを展開"
          >
            <span className="text-gray-400 text-xs">▶</span>
            <span className="text-xs font-semibold text-blue-600" style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}>組織</span>
          </div>
        )}

        {/* Main canvas + right panel */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          <CanvasLayout />
        </div>

        {/* AI Chat drawer */}
        {isChatOpen && (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: chatWidth }}>
            <div
              className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 transition-colors z-10"
              onMouseDown={handleChatResizeStart}
            />
            <AIChatDrawer onClose={() => setIsChatOpen(false)} />
          </div>
        )}

        {/* History panel (right nav) */}
        {isHistoryOpen ? (
          <div className="flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col relative" style={{ width: historyWidth }}>
            <div
              className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-10"
              onMouseDown={handleHistoryResizeStart}
            />
            <HistoryPanel onClose={() => setIsHistoryOpen(false)} />
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-indigo-50 transition-colors"
            onClick={() => setIsHistoryOpen(true)}
            title="操作履歴を展開"
          >
            <span className="text-gray-400 text-xs">◀</span>
            <span className="text-xs font-semibold text-indigo-600" style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}>履歴</span>
          </div>
        )}
      </div>

      {/* ── Drag handle ───────────────────────────────────────────── */}
      <div
        className="h-2 flex-shrink-0 mx-1.5 flex items-center justify-center cursor-row-resize group"
        onMouseDown={handleResizeStart}
      >
        <div className="w-full h-1 bg-gray-300 rounded group-hover:bg-blue-400 transition-colors" />
      </div>

      {/* ── Bottom panel ────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 bg-white rounded-lg shadow mx-1.5 mb-1.5 overflow-hidden"
        style={{ height: excelCollapsed ? BOTTOM_COLLAPSED : bottomHeight }}
      >
        <BottomPanel
          isCollapsed={excelCollapsed}
          onToggleCollapse={toggleExcelCollapse}
        />
      </div>

      {/* Floating editor — fixed, above all panels */}
      <FloatingEditor />

    </div>
  )
}
