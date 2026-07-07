import React from 'react'
import { createPortal } from 'react-dom'
import { ISSUE_TYPE_METAS, type IssueGroup } from '@personnel/domain/rules/validate/issueTypeMeta'

// ── 表示グループ定義 ──────────────────────────────────────────────────────────

const DISPLAY_GROUPS: { label: string; group: IssueGroup }[] = [
  { label: '必須項目',         group: 'required'    },
  { label: '書式',             group: 'format'      },
  { label: 'マスタ整合性',     group: 'consistency' },
  { label: '条件付き制約',     group: 'conditional' },
  { label: '行間バリデーション', group: 'interRow'  },
  { label: 'ワーニング',       group: 'warning'     },
]

const GROUP_HEADER_COLORS: Record<IssueGroup, string> = {
  required:    'bg-red-50 text-red-800',
  format:      'bg-orange-50 text-orange-800',
  consistency: 'bg-yellow-50 text-yellow-800',
  conditional: 'bg-violet-50 text-violet-800',
  interRow:    'bg-blue-50 text-blue-800',
  warning:     'bg-amber-50 text-amber-800',
}

interface Props {
  onClose: () => void
}

export function IssueReferenceModal({ onClose }: Props) {
  const totalCount = ISSUE_TYPE_METAS.length
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">問題種別一覧</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">全 {totalCount} 種別の判定ロジック</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
          >✕</button>
        </div>

        {/* テーブル */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-20">チップ</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">発生条件</th>
              </tr>
            </thead>
            <tbody>
              {DISPLAY_GROUPS.map(({ label, group }) => {
                const metas = ISSUE_TYPE_METAS.filter(m => m.group === group)
                if (metas.length === 0) return null
                return (
                  <React.Fragment key={group}>
                    {/* グループヘッダー行 */}
                    <tr>
                      <td
                        colSpan={2}
                        className={`px-3 py-1.5 text-[10px] font-bold tracking-wide border-y border-gray-100 ${GROUP_HEADER_COLORS[group]}`}
                      >
                        {label}
                      </td>
                    </tr>
                    {/* 問題種別行 */}
                    {metas.map(meta => {
                      const colorCls = meta.level === 'error'
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : meta.level === 'warning'
                          ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      return (
                        <tr key={meta.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 align-top">
                            <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] leading-none whitespace-nowrap ${colorCls}`}>
                              {meta.chipLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 leading-relaxed align-top">
                            {meta.description}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}
