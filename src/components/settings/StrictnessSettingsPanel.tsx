import { useCanvasDisplayStore } from '../../store/canvasDisplayStore'
import {
  resolveFieldStrictness, GLOBAL_DEFAULT_STRICTNESS,
  DEFAULT_UNAVAILABLE_OPERATION_DISPLAY,
  type FieldStrictness, type UnavailableOperationDisplay,
} from '../../domain/optionStrictness'

interface Props {
  onClose: () => void
}

// 条件付き制約を持つフィールドのみ（バリデーション・選択肢の両方に影響する）
const CONFIGURABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'band',                       label: 'バンド' },
  { key: 'positionBand',               label: 'ポジション_バンド' },
  { key: 'payGrade',                   label: '給与等級' },
  { key: 'officialPositionCode',       label: '役職' },
  { key: 'location',                   label: '勤務場所' },
  { key: 'leaveOfAbsenceSign',                  label: '休職フラグ' },
  { key: 'positionUnionFlag',          label: 'ポジション_労働組合員' },
  { key: 'positionDiscretionaryWorkFlag', label: 'ポジション_裁量労働対象' },
  { key: 'discretionaryWorkFlag',      label: '裁量労働対象' },
  { key: 'jobFamily',                  label: 'ジョブファミリー' },
  { key: 'jobType',                    label: 'ジョブタイプ' },
]

const STRICTNESS_OPTIONS: { value: FieldStrictness; label: string; desc: string }[] = [
  { value: 'strict', label: '厳格', desc: '無効選択肢は選択不可・リスト外はエラー' },
  { value: 'guide',  label: '案内', desc: '無効はグレーで表示・選択可・エラーなし' },
  { value: 'free',   label: '自由', desc: '全選択肢を均等表示・バリデーションなし' },
]

const UNAVAIL_OP_OPTIONS: { value: UnavailableOperationDisplay; label: string; desc: string }[] = [
  { value: 'hide',          label: '表示しない',         desc: 'availableFor を通過しない操作は非表示' },
  { value: 'show-disabled', label: 'グレーで表示（不可）', desc: 'グレーで表示するがクリック不可' },
  { value: 'show',          label: 'グレーで表示（可）',   desc: 'グレーで表示しクリック可能（デバッグ用）' },
]

export function StrictnessSettingsPanel({ onClose }: Props) {
  const {
    fieldStrictnessOverrides, setFieldStrictness,
    unavailableOperationDisplay, setUnavailableOperationDisplay,
  } = useCanvasDisplayStore()

  return (
    <div className="fixed z-40 bg-white border border-gray-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ top: 64, right: 16, bottom: 16, width: 520 }}>

      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gray-800 text-white rounded-t-xl">
        <span className="text-sm font-semibold">選択肢の厳密さ設定</span>
        <span className="text-xs text-gray-400">（条件付き制約があるフィールド）</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-white text-lg leading-none px-1">✕</button>
      </div>

      {/* 操作メニューの非該当操作の表示設定 */}
      <div className="flex-shrink-0 px-4 py-3 bg-blue-50 border-b border-blue-100">
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

      {/* 選択肢の厳密さ — グローバルデフォルト表示 */}
      <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
        選択肢の厳密さ — グローバルデフォルト:
        <span className="ml-1 font-medium text-gray-700">
          {STRICTNESS_OPTIONS.find(o => o.value === GLOBAL_DEFAULT_STRICTNESS)?.label}
        </span>
      </div>

      {/* フィールド一覧 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200 w-40">フィールド</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200">設定</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 border-b border-gray-200 w-16">リセット</th>
            </tr>
          </thead>
          <tbody>
            {CONFIGURABLE_FIELDS.map(({ key, label }) => {
              const effective  = resolveFieldStrictness(key, fieldStrictnessOverrides)
              const isOverride = key in fieldStrictnessOverrides
              return (
                <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">
                    {label}
                    {isOverride && <span className="ml-1 text-[9px] text-blue-500">カスタム</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {STRICTNESS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFieldStrictness(key, opt.value)}
                          title={opt.desc}
                          className={`px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                            effective === opt.value
                              ? opt.value === 'strict'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : opt.value === 'guide'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-gray-500 text-white border-gray-500'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {isOverride && (
                      <button
                        onClick={() => setFieldStrictness(key, undefined)}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                        title="デフォルトに戻す"
                      >↩</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 text-[10px] text-gray-400">
        設定は localStorage に保存されます。全リセット:
        <button
          onClick={() => CONFIGURABLE_FIELDS.forEach(f => setFieldStrictness(f.key, undefined))}
          className="ml-1 text-red-400 hover:text-red-600 underline"
        >すべてデフォルトに戻す</button>
      </div>
    </div>
  )
}
