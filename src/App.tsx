import { OverviewPanel } from './components/OverviewPanel'
import { OrgOperationView } from './components/OrgOperationView'
import { PersonDetailPanel } from './components/PersonDetailPanel'
import { ExcelPreview } from './components/ExcelPreview'
import { useStore } from './store/useStore'

export default function App() {
  const { effectiveDate, setEffectiveDate, operations, selectedPersonId } = useStore()

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-6 flex-shrink-0">
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
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>手順数: <span className="text-white font-semibold">{operations.length}</span></span>
        </div>
      </header>

      {/* Main: left overview + center canvas + right person detail */}
      <div className="flex flex-1 overflow-hidden gap-2 p-2">
        {/* Left: org tree + member panel */}
        <div className="w-64 flex-shrink-0 bg-white rounded-lg shadow p-3 overflow-hidden flex flex-col">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex-shrink-0">組織ツリー</h2>
          <OverviewPanel />
        </div>

        {/* Center: org canvas (always visible) */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden min-w-0">
          <OrgOperationView />
        </div>

        {/* Right: person detail panel (when a person is selected) */}
        {selectedPersonId && (
          <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <PersonDetailPanel />
          </div>
        )}
      </div>

      {/* Bottom: Excel preview */}
      <div className="flex-shrink-0">
        <div style={{ maxHeight: '180px' }}>
          <div className="px-3 py-1 bg-gray-700 text-white text-xs font-semibold">Excel申請書プレビュー</div>
          <div style={{ height: '155px', overflowY: 'auto' }}>
            <ExcelPreview />
          </div>
        </div>
      </div>
    </div>
  )
}
