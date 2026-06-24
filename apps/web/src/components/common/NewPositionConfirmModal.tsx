interface Props {
  newPosCode: string
  onCreateNew: () => void
  onKeepCurrent: () => void
}

export function NewPositionConfirmModal({ newPosCode, onCreateNew, onKeepCurrent }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xs mx-4 p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">ポジションの新設</p>
        <p className="text-xs text-gray-600 mb-3">
          給与等級が変更されます。新しいポジションを作成してこの方に設定しますか？
        </p>
        <div className="bg-gray-50 rounded px-3 py-1.5 mb-3 text-[11px] text-gray-500">
          新ポジションコード: <span className="font-mono text-gray-700">{newPosCode}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onKeepCurrent}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >このまま実行</button>
          <button
            onClick={onCreateNew}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >新設して実行</button>
        </div>
      </div>
    </div>
  )
}
