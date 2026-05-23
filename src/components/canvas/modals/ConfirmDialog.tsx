interface ConfirmDialogProps {
  message:   string
  onConfirm: () => void
  onCancel:  () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-80 p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-bold text-gray-800">確認</div>
        <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{message}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => { onConfirm(); onCancel() }}
            className="px-3 py-1.5 rounded text-xs bg-red-600 text-white hover:bg-red-700"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}
