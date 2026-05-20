import { useState, useRef, useEffect, useCallback } from 'react'
import { OrgSearchSidebar } from './components/OrgSearchSidebar'
import { OrgOperationView } from './components/OrgOperationView'
import { EditView } from './components/EditView'
import { BottomPanel } from './components/BottomPanel'
import { AIChatDrawer } from './components/AIChatDrawer'
import { MasterSetup } from './components/MasterSetup'
import { ClearSessionDialog } from './components/ClearSessionDialog'
import { useStore } from './store/useStore'
import { useCodeListStore } from './store/codeListStore'

const BOTTOM_MIN        = 36   // 折りたたみ時はヘッダーだけ
const BOTTOM_MAX_RATIO  = 0.65
const BOTTOM_DEFAULT    = 220
const BOTTOM_COLLAPSED  = 36

export default function App() {
  const { effectiveDate, setEffectiveDate, isLoading, undo, redo, canUndo, canRedo, editMode } = useStore()
  const { isChecked, checkStorage } = useCodeListStore()

  // セッション限りのフラグ — MasterSetup が完了したら true になる
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => { checkStorage() }, [checkStorage])

  const [isTreeOpen,      setIsTreeOpen]      = useState(true)
  const [isChatOpen,      setIsChatOpen]      = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [bottomHeight,    setBottomHeight]    = useState(BOTTOM_DEFAULT)
  const [excelCollapsed,  setExcelCollapsed]  = useState(false)
  const prevBottomHeightRef = useRef(BOTTOM_DEFAULT)

  const toggleExcelCollapse = useCallback(() => {
    if (excelCollapsed) {
      setBottomHeight(prevBottomHeightRef.current)
      setExcelCollapsed(false)
    } else {
      prevBottomHeightRef.current = bottomHeight > BOTTOM_COLLAPSED ? bottomHeight : BOTTOM_DEFAULT
      setBottomHeight(BOTTOM_COLLAPSED)
      setExcelCollapsed(true)
    }
  }, [excelCollapsed, bottomHeight])

  // ── Drag-to-resize ────────────────────────────────────────────
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startY: e.clientY, startH: bottomHeight }

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const delta = dragState.current.startY - ev.clientY
      setBottomHeight(
        Math.max(BOTTOM_MIN, Math.min(window.innerHeight * BOTTOM_MAX_RATIO, dragState.current.startH + delta))
      )
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [bottomHeight])

  if (!isChecked) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  if (!sessionReady) return <MasterSetup onReady={() => setSessionReady(true)} />

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-base font-bold tracking-tight">人事異動管理</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">発令日</label>
          <input
            type="date"
            value={effectiveDate}
            onChange={e => setEffectiveDate(e.target.value)}
            className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded border border-gray-600"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="元に戻す（保存単位）"
          >
            ↩ Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="やり直し"
          >
            Redo ↪
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={() => setIsChatOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              isChatOpen ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span>💬</span>
            <span>AI アシスタント</span>
          </button>
          <button
            onClick={() => setClearDialogOpen(true)}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-red-700 hover:text-white transition-colors"
            title="セッションをクリアして最初から始める"
          >
            ↺ クリア
          </button>
        </div>
      </header>

      {clearDialogOpen && (
        <ClearSessionDialog
          onCleared={() => { setClearDialogOpen(false); setSessionReady(false) }}
          onCancel={() => setClearDialogOpen(false)}
        />
      )}

      {/* ── Upper area: sidebar + canvas + chat drawer ───────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5 pb-0">

        {/* Org search sidebar */}
        {isTreeOpen ? (
          <div className="flex-shrink-0 w-48 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
              <span className="text-xs font-semibold text-blue-600">組織・人物</span>
              <button onClick={() => setIsTreeOpen(false)} title="折りたたむ" className="text-gray-400 hover:text-gray-600 text-xs w-4 h-4 flex items-center justify-center">◀</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <OrgSearchSidebar />
            </div>
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => setIsTreeOpen(true)}
            title="サイドバーを展開"
          >
            <span className="text-gray-400 text-xs">▶</span>
            <span className="text-xs font-semibold text-blue-600" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.08em' }}>組織</span>
          </div>
        )}

        {/* Main canvas: EditView が上にスライドオーバー */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0 relative">
          {/* 組織図ビュー: 常に背景として残る */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: editMode ? 'none' : 'auto' }}
          >
            <OrgOperationView />
          </div>
          {/* 編集ビュー: 右からスライドオーバー */}
          <div
            className="absolute inset-0 z-10 bg-white transition-transform duration-300 ease-in-out"
            style={{
              transform: editMode ? 'translateX(0)' : 'translateX(100%)',
              pointerEvents: editMode ? 'auto' : 'none',
            }}
          >
            <EditView />
          </div>
        </div>

        {/* AI Chat drawer */}
        {isChatOpen && (
          <div className="flex-shrink-0 w-80 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <AIChatDrawer onClose={() => setIsChatOpen(false)} />
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
        style={{ height: bottomHeight }}
      >
        <BottomPanel
          isCollapsed={excelCollapsed}
          onToggleCollapse={toggleExcelCollapse}
        />
      </div>

    </div>
  )
}
