import { useCanvasDisplayStore } from '../../store/canvasDisplayStore'
import {
  DEFAULT_UNAVAILABLE_OPERATION_DISPLAY,
  type UnavailableOperationDisplay,
} from '@personnel/domain/optionStrictness'

interface Props {
  onClose: () => void
}

const UNAVAIL_OP_OPTIONS: { value: UnavailableOperationDisplay; label: string; desc: string }[] = [
  { value: 'hide',          label: '表示しない',         desc: 'availableFor を通過しない操作は非表示' },
  { value: 'show-disabled', label: 'グレーで表示（不可）', desc: 'グレーで表示するがクリック不可' },
  { value: 'show',          label: 'グレーで表示（可）',   desc: 'グレーで表示しクリック可能（デバッグ用）' },
]

export function StrictnessSettingsPanel({ onClose }: Props) {
  const { unavailableOperationDisplay, setUnavailableOperationDisplay } = useCanvasDisplayStore()

  return (
    <div className="fixed z-40 bg-white border border-gray-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ top: 64, right: 16, width: 360 }}>

      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gray-800 text-white rounded-t-xl">
        <span className="text-sm font-semibold">表示設定</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-white text-lg leading-none px-1">✕</button>
      </div>

      <div className="px-4 py-4">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          操作メニューの非該当操作
          <span className="ml-2 text-[10px] font-normal text-gray-400">
            デフォルト: {UNAVAIL_OP_OPTIONS.find(o => o.value === DEFAULT_UNAVAILABLE_OPERATION_DISPLAY)?.label}
          </span>
        </div>
        <div className="flex gap-1.5">
          {UNAVAIL_OP_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setUnavailableOperationDisplay(opt.value)}
              title={opt.desc}
              className={`px-2.5 py-1.5 rounded border text-[10px] font-medium transition-colors ${
                unavailableOperationDisplay === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
