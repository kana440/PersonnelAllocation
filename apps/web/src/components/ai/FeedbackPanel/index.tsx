import { useState } from 'react'
import type { ClassificationWidgetData } from '../../../application/aiTypes'
import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'
import { DashboardView } from './DashboardView'
import { PendingView }   from './PendingView'
import { CodeFixView }   from './CodeFixView'
import { SkillsView }    from './SkillsView'
import { DataView }      from './DataView'

type Tab = 'dashboard' | 'pending' | 'codefixes' | 'skills' | 'data'

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'ダッシュボード',
  pending:   '訂正履歴',
  codefixes: 'Code Fix',
  skills:    'スキル',
  data:      'データ',
}

interface Props {
  onBack:       () => void
  onOpenSkills: () => void
  onApply:      (classified: ClassificationWidgetData) => void
  onReject:     (classifiedId: string) => void
}

export function FeedbackPanel({ onBack, onOpenSkills, onApply, onReject }: Props) {
  const [tab,     setTab]     = useState<Tab>('dashboard')
  const [refresh, setRefresh] = useState(0)
  const doRefresh = () => setRefresh(r => r + 1)

  const stats = feedbackStore.getStats()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors flex-shrink-0"
          title="チャットに戻る"
        >
          ✕
        </button>
        <span className="text-sm font-semibold text-gray-700">🧠 AI 学習状況</span>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-2 px-1 border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'pending' && stats.pendingCount > 0 && (
              <span className="ml-1 text-xs bg-amber-500 text-white rounded-full px-1">{stats.pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'dashboard' && (
          <DashboardView
            refresh={refresh}
            onSetTab={setTab}
            onOpenSkills={onOpenSkills}
          />
        )}
        {tab === 'pending' && (
          <PendingView
            refresh={refresh}
            onRefresh={doRefresh}
            onApply={onApply}
            onReject={onReject}
          />
        )}
        {tab === 'codefixes' && (
          <CodeFixView
            refresh={refresh}
            onRefresh={doRefresh}
          />
        )}
        {tab === 'skills' && (
          <SkillsView
            refresh={refresh}
            onOpenSkills={onOpenSkills}
          />
        )}
        {tab === 'data' && (
          <DataView onRefresh={doRefresh} />
        )}
      </div>
    </div>
  )
}
