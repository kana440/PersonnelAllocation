import type { Skill } from '../../../infrastructure/skills/types'

const STATUS_BADGE: Record<Skill['status'], string> = {
  active:   'bg-green-100 text-green-700',
  disabled: 'bg-gray-100 text-gray-500',
  draft:    'bg-gray-100 text-gray-500',  // draft は無効と同じ扱い
}
const STATUS_LABEL: Record<Skill['status'], string> = {
  active:   '有効',
  disabled: '無効',
  draft:    '無効',
}

interface Props {
  skills:    Skill[]
  onEdit:    (skill: Skill) => void
  onToggle:  (skill: Skill) => void
  onNew:     () => void
  onImport:  () => void
  onExportAll: () => void
}

export function SkillList({ skills, onEdit, onToggle, onNew, onImport, onExportAll }: Props) {
  const activeCount = skills.filter(s => s.status === 'active').length

  return (
    <div className="flex flex-col h-full">
      {/* サブヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className="text-xs text-gray-500">
          {activeCount} 件有効 / {skills.length} 件
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onImport}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
            title="インポート (.md / .zip)"
          >
            ↑ 取込
          </button>
          <button
            onClick={onExportAll}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
            title="全件エクスポート (.zip)"
          >
            ↓ 全件
          </button>
          <button
            onClick={onNew}
            className="text-xs font-medium bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors"
          >
            ＋ 新規
          </button>
        </div>
      </div>

      {/* スキル一覧 */}
      <div className="flex-1 overflow-y-auto">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <p className="text-xs">スキルがありません</p>
            <button onClick={onNew} className="text-xs text-blue-500 hover:text-blue-700 underline">
              新規作成
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {skills.map(skill => (
              <li key={skill.slug} className="group flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50">
                {/* トグル */}
                <button
                  onClick={() => onToggle(skill)}
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
                    {skill.isBuiltin && (
                      <span className="flex-shrink-0 text-[10px] text-gray-400 border border-gray-200 px-1 py-0 rounded">組込</span>
                    )}
                    <span className={`flex-shrink-0 text-[10px] px-1 py-0 rounded ${STATUS_BADGE[skill.status]}`}>
                      {STATUS_LABEL[skill.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug truncate">{skill.description}</p>
                </div>

                {/* 編集ボタン */}
                <button
                  onClick={() => onEdit(skill)}
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded hover:bg-gray-200"
                >
                  編集
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
