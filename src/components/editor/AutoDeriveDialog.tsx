interface ChangedField {
  label:  string
  before: string
  after:  string
}

interface Props {
  changes:  ChangedField[]
  onApply:  () => void
  onCancel: () => void
}

export function AutoDeriveDialog({ changes, onApply, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">自動補完の確認</h3>
        <p className="text-xs text-gray-500 mb-3">以下のフィールドが更新されます。</p>

        <div className="border border-gray-200 rounded overflow-hidden mb-3">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-gray-500 font-medium border-b border-gray-200">フィールド</th>
                <th className="px-2 py-1.5 text-left text-gray-400 font-medium border-b border-gray-200">現在値</th>
                <th className="px-2 py-1.5 text-left text-blue-600 font-medium border-b border-gray-200">補完後</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(({ label, before, after }, i) => (
                <tr key={i} className="border-t border-gray-100 first:border-0">
                  <td className="px-2 py-1.5 text-gray-600">{label}</td>
                  <td className="px-2 py-1.5 text-gray-400">{before || <span className="italic">（空）</span>}</td>
                  <td className="px-2 py-1.5 text-blue-700 font-medium">{after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-4">
          ※ 適用後も「保存」ボタンを押すまで確定されません。
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onApply}
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            適用
          </button>
        </div>
      </div>
    </div>
  )
}
