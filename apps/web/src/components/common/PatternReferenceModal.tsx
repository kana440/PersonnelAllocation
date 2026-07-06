import React from 'react'
import { createPortal } from 'react-dom'
import { EDIT_PATTERN_META } from '@personnel/domain/patterns/editPattern'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import { PATTERN_CHIP_DEFS } from './patternChips'

// ── 表示グループ定義 ──────────────────────────────────────────────────────────

const DISPLAY_GROUPS: { label: string; patterns: EditPattern[] }[] = [
  {
    label: '職務情報系',
    patterns: [
      'promotion', 'demotion',
      'bandChange', 'titleChange', 'mpTrackSwitch',
      'jobFamilyChange', 'jobTypeChange', 'payGradeChange', 'secondmentAcceptanceModeSwitch',
      'employmentExtension', 'employmentTypeChange',
    ],
  },
  {
    label: 'ポジション系',
    patterns: [
      'orgTransfer', 'orgRestructure', 'positionChange', 'managerChange',
      'newPosition', 'concurrentAdd', 'concurrentRelease',
    ],
  },
  {
    label: '出向系（本務）',
    patterns: ['secondmentOut', 'secondmentIn', 'secondmentOutRelease', 'secondmentInRelease'],
  },
  {
    label: '出向系（兼務）',
    patterns: [
      'concurrentSecondmentOutNonSF', 'concurrentSecondmentIn',
      'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
    ],
  },
  {
    label: '人操作系',
    patterns: [
      'leaveOfAbsence', 'returnFromLeave', 'executiveAppointment',
      'employmentTransfer', 'termination', 'noChange',
    ],
  },
]

const chipByKey = new Map(PATTERN_CHIP_DEFS.map(d => [d.key, d]))

// グループごとのヘッダー色
const GROUP_HEADER_COLORS: Record<string, string> = {
  '職務情報系':   'bg-purple-50 text-purple-800',
  'ポジション系': 'bg-blue-50 text-blue-800',
  '出向系（本務）': 'bg-amber-50 text-amber-800',
  '出向系（兼務）': 'bg-orange-50 text-orange-800',
  '人操作系':     'bg-green-50 text-green-800',
}

interface Props {
  onClose: () => void
}

export function PatternReferenceModal({ onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">変更パターン一覧</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">全 {PATTERN_CHIP_DEFS.length} パターンの判定ロジック</p>
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
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">チップ</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-36">フルラベル</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">判定ロジック</th>
              </tr>
            </thead>
            <tbody>
              {DISPLAY_GROUPS.map(group => (
                <React.Fragment key={group.label}>
                  {/* グループヘッダー行 */}
                  <tr>
                    <td
                      colSpan={3}
                      className={`px-3 py-1.5 text-[10px] font-bold tracking-wide border-y border-gray-100 ${GROUP_HEADER_COLORS[group.label] ?? 'bg-gray-50 text-gray-600'}`}
                    >
                      {group.label}
                    </td>
                  </tr>
                  {/* パターン行 */}
                  {group.patterns.map(key => {
                    const meta = EDIT_PATTERN_META[key]
                    const chip = chipByKey.get(key)
                    return (
                      <tr key={key} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 align-top">
                          {chip && (
                            <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] leading-none whitespace-nowrap ${chip.color}`}>
                              {chip.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700 align-top">{meta.label}</td>
                        <td className="px-3 py-2 text-gray-500 leading-relaxed align-top">
                          {meta.description ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}
