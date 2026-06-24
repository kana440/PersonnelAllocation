import type { IntentDef } from './intents'

interface IntentCardProps {
  intent:              IntentDef
  hasPosition:         boolean
  hasSubordinates:     boolean
  subordinateCount:    number
  leavePositionVacant: boolean
  onLeaveVacantChange: (v: boolean) => void
  onPick:              (intent: IntentDef) => void
}

/**
 * インテント選択カード。
 * supportsLeaveVacant が true のときは「元ポジションを空席として残す」チェックボックスを下部に表示する。
 */
export function IntentCard({
  intent, hasPosition, hasSubordinates, subordinateCount,
  leavePositionVacant, onLeaveVacantChange, onPick,
}: IntentCardProps) {
  const showVacant = !!intent.def.supportsLeaveVacant && hasPosition && !intent.usePrimaryOnly

  if (showVacant) {
    return (
      <div
        className={`flex flex-col items-start text-left rounded-xl border-2 transition-colors bg-white overflow-hidden ${intent.border}`}
      >
        {/* 上部: クリックで実行 */}
        <button
          onClick={() => onPick(intent)}
          className="w-full text-left p-4 hover:bg-blue-50 transition-colors"
        >
          <span className="text-2xl mb-2 block">{intent.icon}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 inline-block ${intent.badge}`}>
            {intent.def.label}
          </span>
          <p className="text-xs font-medium text-gray-800 mb-1.5">{intent.title}</p>
          <p className="text-[11px] text-gray-500 leading-relaxed">{intent.desc}</p>
        </button>
        {/* 下部: 空席オプション（実行とは独立） */}
        <div
          className={`w-full border-t px-4 py-2.5 text-xs ${
            hasSubordinates ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {hasSubordinates && (
            <p className="text-[10px] font-semibold text-amber-800 mb-1.5">
              部下が {subordinateCount} 名います
            </p>
          )}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={leavePositionVacant}
              onChange={e => onLeaveVacantChange(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
            />
            <span className={hasSubordinates ? 'text-amber-800' : 'text-gray-600'}>
              {hasSubordinates
                ? '元のポジションを空席として残す（本人のみ移動する場合）'
                : '元のポジションを空席として残す'}
            </span>
          </label>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => onPick(intent)}
      className={`flex flex-col items-start text-left p-4 rounded-xl border-2 transition-colors bg-white ${intent.border}`}
    >
      <span className="text-2xl mb-2">{intent.icon}</span>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${intent.badge}`}>
        {intent.def.label}
      </span>
      <p className="text-xs font-medium text-gray-800 mb-1.5">{intent.title}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed">{intent.desc}</p>
    </button>
  )
}
