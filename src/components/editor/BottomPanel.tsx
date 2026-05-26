import { ExcelPreview } from './ExcelPreview'

interface Props {
  isCollapsed:      boolean
  onToggleCollapse: () => void
}

export function BottomPanel({ isCollapsed, onToggleCollapse }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ヘッダー（常時表示） ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600">要員配置リスト（Excel形式プレビュー）</span>
        <span className="text-xs text-gray-400 flex-shrink-0">
          シングルクリック: 選択 / ダブルクリック: 編集
        </span>
        <button
          onClick={onToggleCollapse}
          className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
          title={isCollapsed ? 'Excelを展開' : 'Excelを折りたたむ'}
        >
          {isCollapsed ? '▲ 展開' : '▼ 折りたたむ'}
        </button>
      </div>

      {/* ── Excel 一覧（折りたたみで非表示） ── */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden min-h-0">
          <ExcelPreview />
        </div>
      )}
    </div>
  )
}
