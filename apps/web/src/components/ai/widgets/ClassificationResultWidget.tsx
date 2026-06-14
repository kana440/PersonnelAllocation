import type { ClassificationWidgetData } from '../../../application/aiTypes'

interface Props {
  classified: ClassificationWidgetData
  onApply:  (classified: ClassificationWidgetData) => void
  onReject: (classifiedId: string) => void
}

const KIND_LABELS: Record<string, string> = {
  tool_description_issue: 'ツール説明の改善',
  business_rule_gap:      '業務ルールの追加',
  workflow_pattern:       'スキルの作成',
  tool_logic_bug:         'コード修正依頼',
  missing_tool:           '新規ツール依頼',
}

const KIND_COLORS: Record<string, string> = {
  tool_description_issue: 'bg-blue-50 border-blue-200',
  business_rule_gap:      'bg-green-50 border-green-200',
  workflow_pattern:       'bg-purple-50 border-purple-200',
  tool_logic_bug:         'bg-red-50 border-red-200',
  missing_tool:           'bg-orange-50 border-orange-200',
}

export function ClassificationResultWidget({ classified, onApply, onReject }: Props) {
  if (classified.status !== 'pending') {
    const label = classified.status === 'applied' ? '✅ 適用済み' : '❌ 却下済み'
    return (
      <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    )
  }

  const colorClass = KIND_COLORS[classified.kind] ?? 'bg-gray-50 border-gray-200'
  const label      = KIND_LABELS[classified.kind] ?? classified.kind
  const isCodeFix  = classified.kind === 'tool_logic_bug' || classified.kind === 'missing_tool'

  return (
    <div className={`mt-2 p-3 border rounded-xl text-sm ${colorClass}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-medium text-gray-800">🔍 {label}</span>
        <span className="text-xs text-gray-500">
          信頼度 {Math.round(classified.confidence * 100)}%
        </span>
      </div>

      <p className="text-xs text-gray-600 mb-2">{classified.reasoning}</p>

      {classified.businessRuleDraft && (
        <div className="bg-white rounded-lg p-2 mb-2 border border-green-200">
          <p className="text-xs font-medium text-gray-700 mb-0.5">追加するルール:</p>
          <p className="text-xs text-gray-800">「{classified.businessRuleDraft.ruleText}」</p>
        </div>
      )}

      {classified.toolDescriptionDraft && (
        <div className="bg-white rounded-lg p-2 mb-2 border border-blue-200 space-y-1">
          <p className="text-xs font-medium text-gray-700">
            ツール: <code className="bg-blue-50 px-1 rounded">{classified.toolDescriptionDraft.targetTool}</code>
          </p>
          <p className="text-xs text-gray-500">
            現在: {classified.toolDescriptionDraft.currentDescription}
          </p>
          <p className="text-xs text-gray-800">
            改善後: {classified.toolDescriptionDraft.proposedDescription}
          </p>
        </div>
      )}

      {classified.skillDraft && (
        <div className="bg-white rounded-lg p-2 mb-2 border border-purple-200 space-y-1">
          <p className="text-xs font-medium text-gray-700">スキル名: {classified.skillDraft.name}</p>
          <p className="text-xs text-gray-600">{classified.skillDraft.description}</p>
          <p className="text-xs text-gray-500">
            ツール: {classified.skillDraft.allowedTools.join(', ')}
          </p>
        </div>
      )}

      {classified.codeFixDraft && (
        <div className="bg-white rounded-lg p-2 mb-2 border border-red-200 space-y-1">
          <p className="text-xs font-medium text-gray-700">{classified.codeFixDraft.title}</p>
          <p className="text-xs text-gray-600">{classified.codeFixDraft.description}</p>
          <p className="text-xs text-gray-500">
            期待動作: {classified.codeFixDraft.expectedBehavior}
          </p>
          {classified.codeFixDraft.targetTool && (
            <p className="text-xs text-gray-400">
              関連ツール: <code className="bg-red-50 px-1 rounded">{classified.codeFixDraft.targetTool}</code>
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          className="flex-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          onClick={() => onApply(classified)}
        >
          {isCodeFix ? '✅ 記録する' : '✅ 適用する'}
        </button>
        <button
          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={() => onReject(classified.id)}
        >
          ❌ 却下
        </button>
      </div>
    </div>
  )
}
