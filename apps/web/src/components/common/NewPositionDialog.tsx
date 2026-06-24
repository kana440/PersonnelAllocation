import { useState } from 'react'

interface Props {
  suggestedCode: string
  onConfirm:     (code: string) => void
  onCancel:      () => void
}

export function NewPositionDialog({ suggestedCode, onConfirm, onCancel }: Props) {
  const [mode,       setMode]       = useState<'auto' | 'manual'>('auto')
  const [manualCode, setManualCode] = useState('')

  const resolvedCode = mode === 'auto' ? suggestedCode : manualCode.trim()

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-80 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-800">ポジションコードの設定</div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'auto'}
              onChange={() => setMode('auto')}
              className="accent-blue-600 mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-700">自動採番</span>
              <span className="font-mono text-[11px] text-gray-400">{suggestedCode}</span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
              className="accent-blue-600 mt-0.5"
            />
            <div className="flex flex-col gap-1.5 flex-1">
              <span className="text-xs font-medium text-gray-700">コードを入力</span>
              {mode === 'manual' && (
                <input
                  autoFocus
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="ポジションコード"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                />
              )}
            </div>
          </label>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => resolvedCode && onConfirm(resolvedCode)}
            disabled={!resolvedCode}
            className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            設定する
          </button>
        </div>
      </div>
    </div>
  )
}
