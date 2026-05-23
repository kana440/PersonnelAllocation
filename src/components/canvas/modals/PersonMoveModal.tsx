import { useState } from 'react'

interface PersonMoveModalProps {
  personName:  string
  toOrgName:   string
  posTitle:    string
  hasPosition: boolean
  onConfirm:   (retireOriginal: boolean) => void
  onCancel:    () => void
}

export function PersonMoveModal({ personName, toOrgName, posTitle, hasPosition, onConfirm, onCancel }: PersonMoveModalProps) {
  const [retireOriginal, setRetireOriginal] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-96 p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-bold text-gray-800">別組織に移動</div>
        <div className="text-xs text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-800">{personName}</span> を{' '}
          <span className="font-semibold text-gray-800">{toOrgName}</span> に移動します。
          <br />
          移動先に新規ポジションを作成し、元のポジション属性を引き継ぎます。
          {posTitle && (
            <>
              <br />
              <span className="text-gray-400">ポジション名: </span>
              <span className="text-gray-700">{posTitle}</span>
            </>
          )}
          <br />
          <span className="text-gray-400">レポートラインは移動先組織の最上位ポジションをデフォルトとします。</span>
        </div>
        {hasPosition && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={retireOriginal}
              onChange={e => setRetireOriginal(e.target.checked)}
              className="accent-blue-600"
            />
            <span className="text-xs text-gray-600">元のポジションを廃止する</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => onConfirm(retireOriginal)}
            className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
          >
            移動する
          </button>
        </div>
      </div>
    </div>
  )
}
