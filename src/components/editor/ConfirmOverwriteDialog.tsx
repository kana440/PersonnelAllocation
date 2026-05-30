interface Props {
  message:      string
  okLabel?:     string
  okCodeLabel?: string
  onOk:         () => void
  onOkCodeOnly: () => void
  onCancel:     () => void
}

export function ConfirmOverwriteDialog({
  message,
  okLabel     = 'OK（関連項目すべて反映）',
  okCodeLabel = 'OK（コードのみ反映）',
  onOk, onOkCodeOnly, onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
        <p className="text-sm text-gray-700 mb-4 leading-relaxed">{message}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onOk}
            className="w-full text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {okLabel}
          </button>
          <button
            onClick={onOkCodeOnly}
            className="w-full text-sm px-4 py-2 border border-blue-400 text-blue-600 rounded hover:bg-blue-50 transition-colors"
          >
            {okCodeLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full text-sm px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
