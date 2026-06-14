interface Props {
  fieldLabel:     string
  suggestedValue: string
  onConfirm:      () => void
  onSkip:         () => void
}

export function TitleSuggestionModal({ fieldLabel, suggestedValue, onConfirm, onSkip }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xs mx-4 p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">{fieldLabel}の更新</p>
        <p className="text-xs text-gray-500 mb-3">
          {fieldLabel}を
          <span className="font-medium text-gray-800 mx-1">「{suggestedValue}」</span>
          に更新しますか？
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onSkip}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >スキップ</button>
          <button
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >はい、更新する</button>
        </div>
      </div>
    </div>
  )
}
