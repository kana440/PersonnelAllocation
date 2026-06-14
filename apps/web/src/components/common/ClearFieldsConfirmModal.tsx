interface Props {
  cleared: string[]
  changed: string[]
  onConfirm: () => void
  onCancel:  () => void
}

export function ClearFieldsConfirmModal({ cleared, changed, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-80 p-5">
        <p className="text-sm font-semibold text-gray-800 mb-3">この操作の影響を確認してください</p>

        {cleared.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-orange-700 mb-1">以下の項目が空欄になります</p>
            <ul className="text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
              {cleared.map(label => (
                <li key={label} className="flex items-center gap-1.5">
                  <span className="text-orange-400">⚠</span>{label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {changed.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-blue-700 mb-1">以下の項目が自動更新されます</p>
            <ul className="text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
              {changed.map(label => (
                <li key={label} className="flex items-center gap-1.5">
                  <span className="text-blue-400">ℹ</span>{label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-4">続けて実行しますか？</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button
            onClick={onConfirm}
            className="flex-1 text-xs px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600"
          >確認して実行</button>
        </div>
      </div>
    </div>
  )
}
