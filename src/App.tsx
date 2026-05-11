import { useState, useRef, useEffect, useCallback } from 'react'
import { OverviewPanel } from './components/OverviewPanel'
import { OrgOperationView } from './components/OrgOperationView'
import { ExcelPreview } from './components/ExcelPreview'
import { AIChatDrawer } from './components/AIChatDrawer'
import { SearchPersonPanel } from './components/SearchPersonPanel'
import { useStore } from './store/useStore'
import { createMockContainer } from './infrastructure/container'

type BottomTab = 'search' | 'excel'

const BOTTOM_MIN = 80
const BOTTOM_MAX_RATIO = 0.65
const BOTTOM_DEFAULT = 220

export default function App() {
  const { effectiveDate, setEffectiveDate, operations, selectedPersonId, isLoading, loadData } = useStore()

  useEffect(() => { loadData(createMockContainer()) }, [loadData])

  const [isTreeOpen, setIsTreeOpen]     = useState(true)
  const [isChatOpen, setIsChatOpen]     = useState(false)
  const [bottomTab, setBottomTab]       = useState<BottomTab>('search')
  const [bottomHeight, setBottomHeight] = useState(BOTTOM_DEFAULT)

  // Auto-switch to search tab when a person is selected
  useEffect(() => {
    if (selectedPersonId) setBottomTab('search')
  }, [selectedPersonId])

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
        <div className="text-xs text-gray-400">
          操作: <span className="text-white font-semibold">{operations.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsChatOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              isChatOpen ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span>💬</span>
            <span>AI アシスタント</span>
          </button>
        </div>
      </header>

      {/* ── Upper area: tree + canvas + chat drawer ───────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0 gap-1.5 p-1.5 pb-0">

        {/* Org tree sidebar */}
        {isTreeOpen ? (
          <div className="flex-shrink-0 w-44 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
              <span className="text-xs font-semibold text-blue-600">組織・職務・人物</span>
              <button onClick={() => setIsTreeOpen(false)} title="折りたたむ" className="text-gray-400 hover:text-gray-600 text-xs w-4 h-4 flex items-center justify-center">◀</button>
            </div>
            <div className="flex-1 overflow-hidden p-1.5">
              <OverviewPanel />
            </div>
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-7 bg-white rounded-lg shadow flex flex-col items-center py-2 gap-1 cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => setIsTreeOpen(true)}
            title="ツリーを展開"
          >
            <span className="text-gray-400 text-xs">▶</span>
            <span className="text-xs font-semibold text-blue-600" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.08em' }}>組織</span>
          </div>
        )}

        {/* Main canvas */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          <OrgOperationView />
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

      {/* ── Bottom panel (full width) ────────────────────────────── */}
      <div
        className="flex-shrink-0 bg-white rounded-lg shadow mx-1.5 mb-1.5 flex flex-col overflow-hidden"
        style={{ height: bottomHeight }}
      >
        {/* Tab bar */}
        <div className="flex-shrink-0 flex items-center border-b border-gray-200 bg-gray-50 px-1">
          <button
            onClick={() => setBottomTab('search')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
              bottomTab === 'search'
                ? 'border-blue-500 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            💼 ポジション・個人情報
          </button>
          <button
            onClick={() => setBottomTab('excel')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
              bottomTab === 'excel'
                ? 'border-blue-500 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 Excel申請書プレビュー
          </button>
          <div className="ml-auto pr-2 text-xs text-gray-400">
            高さ: {Math.round(bottomHeight)}px
            <button onClick={() => setBottomHeight(BOTTOM_DEFAULT)} className="ml-1 hover:text-gray-600">↺</button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {bottomTab === 'search' ? (
            <SearchPersonPanel />
          ) : (
            <div className="h-full overflow-auto">
              <ExcelPreview />
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
