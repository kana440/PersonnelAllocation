import React from 'react'
import { createPortal } from 'react-dom'
import { ALL_EDIT_OPERATIONS } from '@personnel/domain/commands/defs'
import type { OperationGroup, OperationEntryPoint } from '@personnel/domain/commands/defs'

// ── 表示グループ定義 ──────────────────────────────────────────────────────────

const DISPLAY_GROUPS: { label: string; group: OperationGroup }[] = [
  { label: '職務情報系',         group: 'jobClassification' },
  { label: 'ポジション系',       group: 'position' },
  { label: '人操作系',           group: 'person' },
  { label: '本務出向系',         group: 'secondmentMain' },
  { label: '兼務出向系',         group: 'secondmentConcurrent' },
]

const GROUP_HEADER_COLORS: Record<OperationGroup, string> = {
  position:              'bg-blue-50 text-blue-800',
  jobClassification:     'bg-purple-50 text-purple-800',
  person:                'bg-green-50 text-green-800',
  secondmentMain:        'bg-amber-50 text-amber-800',
  secondmentConcurrent:  'bg-orange-50 text-orange-800',
}

const ENTRY_LABELS: Record<OperationEntryPoint, { label: string; cls: string }> = {
  personMenu:   { label: '人メニュー', cls: 'bg-blue-100 text-blue-700' },
  dragIntent:   { label: 'ドラッグ',   cls: 'bg-indigo-100 text-indigo-700' },
  orgAddButton: { label: '組織+ボタン', cls: 'bg-gray-100 text-gray-600' },
  summaryPanel: { label: '操作パネル', cls: 'bg-teal-100 text-teal-700' },
}

interface Props {
  onClose: () => void
}

export function OperationReferenceModal({ onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[85vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">操作一覧</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">全 {ALL_EDIT_OPERATIONS.length} 操作の定義</p>
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
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-36">操作名</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-32">入口</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-56">有効条件</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">説明</th>
              </tr>
            </thead>
            <tbody>
              {DISPLAY_GROUPS.map(({ label, group }) => {
                const ops = ALL_EDIT_OPERATIONS.filter(op => op.group === group)
                if (ops.length === 0) return null
                return (
                  <React.Fragment key={group}>
                    <tr>
                      <td
                        colSpan={4}
                        className={`px-3 py-1.5 text-[10px] font-bold tracking-wide border-y border-gray-100 ${GROUP_HEADER_COLORS[group]}`}
                      >
                        {label}
                      </td>
                    </tr>
                    {ops.map(op => (
                      <tr key={op.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-700 font-medium align-top whitespace-nowrap">
                          <div>{op.label}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{op.id}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-0.5">
                            {(op.entryPoints ?? []).map(ep => {
                              const { label: epLabel, cls } = ENTRY_LABELS[ep]
                              return (
                                <span key={ep} className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${cls}`}>
                                  {epLabel}
                                </span>
                              )
                            })}
                            {!op.entryPoints?.length && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500 leading-relaxed align-top">
                          {op.availabilityNote ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 leading-relaxed align-top">
                          {op.description ?? '—'}
                        </td>
                      </tr>
                    ))}
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
