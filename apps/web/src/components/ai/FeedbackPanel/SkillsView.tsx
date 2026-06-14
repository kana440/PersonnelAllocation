import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'
import { useSkillStore } from '../../../store/skillStore'

interface Props {
  refresh:      number
  onOpenSkills: () => void
}

export function SkillsView({ refresh: _, onOpenSkills }: Props) {
  const { skills, save } = useSkillStore()
  const aiSlugs  = new Set(feedbackStore.getAiSkillSlugs())
  const aiSkills = skills.filter(s => aiSlugs.has(s.slug))

  const handleToggle = async (slug: string, current: 'active' | 'disabled' | 'draft') => {
    const skill = skills.find(s => s.slug === slug)
    if (!skill) return
    await save({ ...skill, status: current === 'active' ? 'disabled' : 'active', updatedAt: new Date().toISOString() })
  }

  if (aiSkills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
        <p className="text-2xl">⚡</p>
        <p className="text-sm font-medium text-gray-600">AI生成スキルはありません</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          チャットでの訂正が「ワークフローパターン」に<br />
          分類・適用されるとここに表示されます
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className="text-xs text-gray-500">
          {aiSkills.filter(s => s.status === 'active').length} 件有効 / {aiSkills.length} 件
        </span>
        <button
          onClick={onOpenSkills}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          全スキル設定 →
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {aiSkills.map(skill => (
          <li key={skill.slug} className="flex items-start gap-2 px-3 py-3 hover:bg-gray-50">
            {/* トグル */}
            <button
              onClick={() => void handleToggle(skill.slug, skill.status)}
              title={skill.status === 'active' ? '無効化' : '有効化'}
              className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border transition-colors ${
                skill.status === 'active'
                  ? 'bg-green-500 border-green-500'
                  : 'bg-white border-gray-300 hover:border-gray-400'
              }`}
            >
              {skill.status === 'active' && (
                <svg viewBox="0 0 10 8" fill="none" className="w-full h-full p-0.5">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-medium text-gray-800 truncate">{skill.name}</span>
                <span className="flex-shrink-0 text-[10px] px-1 py-0 rounded bg-purple-100 text-purple-700">AI生成</span>
                <span className={`flex-shrink-0 text-[10px] px-1 py-0 rounded ${
                  skill.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {skill.status === 'active' ? '有効' : '無効'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">{skill.description}</p>
              {skill.allowedTools && skill.allowedTools.length > 0 && (
                <p className="text-[10px] text-gray-300 mt-0.5">
                  ツール: {skill.allowedTools.join(', ')}
                </p>
              )}
            </div>

            {/* 編集ボタン → SkillsPanel で開く */}
            <button
              onClick={onOpenSkills}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200"
              title="スキル設定で編集"
            >
              編集
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
