import { useState } from 'react'

interface Props {
  newPosCode:      string
  /** 部下がいる場合は true を渡す。引き継ぎ方法選択 UI を表示し、onCreateNew に選択値を渡す */
  hasSubordinates?: boolean
  onCreateNew:     (managerTransferMode?: string) => void
  onKeepCurrent:   () => void
}

export function NewPositionConfirmModal({ newPosCode, hasSubordinates, onCreateNew, onKeepCurrent }: Props) {
  const [transferMode, setTransferMode] = useState<'inherit' | 'handoff'>('inherit')

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

        {hasSubordinates && (
          <div className="border border-amber-200 bg-amber-50 rounded p-3 mb-3">
            <p className="text-[11px] font-semibold text-amber-800 mb-2">部下の引き継ぎ</p>
            <p className="text-[10px] text-amber-700 mb-2">
              現在のポジションを上司として持つ部下がいます。新ポジションに移行後、部下はどうしますか？
            </p>
            <label className="flex items-start gap-2 cursor-pointer mb-1.5">
              <input
                type="radio" name="transferMode" value="inherit"
                checked={transferMode === 'inherit'}
                onChange={() => setTransferMode('inherit')}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-[11px] text-gray-700">
                <span className="font-medium">引き継ぐ</span>
                <span className="text-gray-500 ml-1">— 部下の上司Posを新ポジションに更新</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio" name="transferMode" value="handoff"
                checked={transferMode === 'handoff'}
                onChange={() => setTransferMode('handoff')}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-[11px] text-gray-700">
                <span className="font-medium">他メンバに引き継ぎ</span>
                <span className="text-gray-500 ml-1">— 旧ポジションを空席として残す</span>
              </span>
            </label>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onKeepCurrent}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >このまま実行</button>
          <button
            onClick={() => onCreateNew(hasSubordinates ? transferMode : undefined)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >新設して実行</button>
        </div>
      </div>
    </div>
  )
}
