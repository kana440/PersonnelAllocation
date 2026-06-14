interface Props {
  fieldLabels: string[]
  onConfirm:   () => void
  onCancel:    () => void
}

export function ClearFieldsConfirmModal({ fieldLabels, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-80 p-5">
        <p className="text-sm font-semibold text-gray-800 mb-2">以下の項目が空欄になります</p>
        <ul className="text-xs text-gray-600 mb-4 space-y-0.5 max-h-40 overflow-y-auto">
          {fieldLabels.map(label => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="text-orange-400">⚠</span>{label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500 mb-4">続けて実行しますか？</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button
            onClick={onConfirm}
            className="flex-1 text-xs px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600"
          >空欄にして実行</button>
        </div>
      </div>
    </div>
  )
}
