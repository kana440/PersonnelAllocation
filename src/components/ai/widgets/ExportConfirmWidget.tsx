import { useState } from 'react'
import type { PersonDiff } from '../types'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  changeCount: number
  groups: Array<{ orgName: string; persons: PersonDiff[] }>
  isActive: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ExportConfirmWidget({ changeCount, groups, isActive, onConfirm, onCancel }: Props) {
  const [showDetail, setShowDetail] = useState(false)

  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3 py-3">
        {changeCount === 0 ? (
          <p className="text-sm text-gray-500">変更はありません。現在のデータをそのまま出力します。</p>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              変更件数：<span className="font-semibold text-blue-600">{changeCount} 件</span>
            </p>
            {groups.length > 0 && (
              <button
                onClick={() => setShowDetail(v => !v)}
                className="mt-1.5 text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >
                {showDetail ? '▾ 変更一覧を閉じる' : '▸ 変更一覧を確認する'}
              </button>
            )}
            {showDetail && (
              <div className="mt-2 max-h-60 overflow-y-auto">
                {groups.map(g => (
                  <div key={g.orgName} className="mb-3">
                    <div className="text-xs text-gray-500 font-medium mb-1">{g.orgName}</div>
                    <DiffTable diffs={g.persons} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {isActive && (
        <div className="bg-blue-50 px-3 py-2.5 flex gap-2 border-t border-blue-100">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            このまま出力する
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
          >
            戻る
          </button>
        </div>
      )}
    </div>
  )
}
