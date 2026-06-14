import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'

type Tab = 'dashboard' | 'pending' | 'codefixes' | 'skills' | 'data'

interface Props {
  refresh:      number
  onSetTab:     (tab: Tab) => void
  onOpenSkills: () => void
}

export function DashboardView({ refresh: _, onSetTab }: Props) {
  const stats = feedbackStore.getStats()

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-3">
      {/* 訂正キャプチャ */}
      <button
        onClick={() => onSetTab('pending')}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors"
      >
        <p className="text-xs text-gray-500 mb-1">訂正キャプチャ（累計）</p>
        <div className="flex items-baseline justify-between">
          <p className="text-xl font-bold text-gray-800">
            {stats.captureCount}
            <span className="text-sm font-normal text-gray-500 ml-1">件</span>
          </p>
          <span className="text-xs text-blue-400">履歴を見る →</span>
        </div>
      </button>

      {/* 適用済み改善 */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-green-700">適用済み改善</p>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">ツール説明の改善</span>
            <span className="font-medium text-gray-800">{stats.toolDescriptionCount} 件</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">業務ルールの追加</span>
            <span className="font-medium text-gray-800">{stats.learnedRuleCount} 件</span>
          </div>
          <button
            onClick={() => onSetTab('skills')}
            className="w-full flex justify-between items-center text-sm hover:bg-green-100 rounded-lg px-1 -mx-1 transition-colors"
          >
            <span className="text-gray-600">スキルの作成</span>
            <span className="font-medium text-blue-600 flex items-center gap-1">
              {stats.skillCount} 件 <span className="text-gray-400">→</span>
            </span>
          </button>
        </div>
      </div>

      {/* 承認待ち */}
      {stats.pendingCount > 0 ? (
        <button
          onClick={() => onSetTab('pending')}
          className="w-full bg-amber-50 border border-amber-300 rounded-xl p-3 text-left hover:bg-amber-100 transition-colors"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-amber-800">承認待ち</span>
            <span className="text-lg font-bold text-amber-600">{stats.pendingCount} 件</span>
          </div>
          <p className="text-xs text-amber-600 mt-0.5">タップして確認 → 適用または却下</p>
        </button>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">承認待ち</span>
            <span className="text-sm text-gray-400">なし</span>
          </div>
        </div>
      )}

      {/* Code Fix依頼 */}
      <button
        onClick={() => onSetTab('codefixes')}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors"
      >
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Code Fix 依頼</span>
          <span className="font-medium text-gray-800">
            {stats.codeFixCount > 0 ? `${stats.codeFixCount} 件未解決` : 'なし'}
          </span>
        </div>
        {stats.codeFixCount > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">まとめてエクスポートしてClaudeCodeで実装</p>
        )}
      </button>

      {/* データ管理リンク */}
      <button
        onClick={() => onSetTab('data')}
        className="w-full text-left text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
      >
        データ管理（エクスポート・インポート・クリア）→
      </button>
    </div>
  )
}
