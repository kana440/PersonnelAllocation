import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useDisplayPreferenceStore, type DisplayPreset } from '../../store/displayPreferenceStore'
import { ALL_EDIT_PATTERNS, EDIT_PATTERN_META } from '@personnel/domain/patterns/editPattern'
import { ISSUE_TYPE_METAS, type IssueGroup } from '@personnel/domain/rules/validate/issueTypeMeta'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import { PATTERN_CHIP_DEFS } from './patternChips'

// ── パターングループ定義 ──────────────────────────────────────────────────────

type PatternGroup = 'jobClassification' | 'position' | 'person' | 'secondment'

const PATTERN_GROUPS: { label: string; group: PatternGroup; patterns: EditPattern[] }[] = [
  {
    label: '職務情報系',
    group: 'jobClassification',
    patterns: [
      'promotion', 'demotion',
      'bandChange', 'titleChange', 'mpTrackSwitch',
      'jobFamilyChange', 'jobTypeChange', 'payGradeChange',
      'secondmentAcceptanceModeSwitch', 'employmentExtension', 'employmentTypeChange',
    ],
  },
  {
    label: 'ポジション系',
    group: 'position',
    patterns: [
      'orgTransfer', 'orgRestructure', 'positionChange', 'managerChange',
      'newPosition', 'concurrentAdd', 'concurrentRelease',
    ],
  },
  {
    label: '出向・兼務',
    group: 'secondment',
    patterns: [
      'secondmentOut', 'secondmentIn', 'secondmentOutRelease', 'secondmentInRelease',
      'concurrentSecondmentOutNonSF', 'concurrentSecondmentIn',
      'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
    ],
  },
  {
    label: '人操作系',
    group: 'person',
    patterns: [
      'leaveOfAbsence', 'returnFromLeave', 'executiveAppointment',
      'employmentTransfer', 'termination', 'noChange',
    ],
  },
]

// ── 問題グループ定義 ──────────────────────────────────────────────────────────

const ISSUE_GROUPS: { label: string; group: IssueGroup }[] = [
  { label: '必須項目',       group: 'required'    },
  { label: '書式',           group: 'format'      },
  { label: 'マスタ整合性',   group: 'consistency' },
  { label: '条件付き制約',   group: 'conditional' },
  { label: '行間',           group: 'interRow'    },
  { label: 'ワーニング',     group: 'warning'     },
]

// ── プリセットボタン ──────────────────────────────────────────────────────────

const PRESETS: { value: DisplayPreset; label: string; desc: string }[] = [
  { value: 'full',     label: '全表示',       desc: '全チップを表示' },
  { value: 'standard', label: '標準',         desc: '主要チップのみ（デフォルト）' },
  { value: 'beginner', label: '初心者向け',   desc: '最小限のチップ + エラーのみ' },
  { value: 'custom',   label: 'カスタム',     desc: '個別に設定中' },
]

const patternChipByKey = new Map(PATTERN_CHIP_DEFS.map(d => [d.key, d]))

interface Props {
  onClose: () => void
}

export function DisplayPreferenceModal({ onClose }: Props) {
  const { preset, visiblePatterns, visibleIssueIds, applyPreset, togglePattern, toggleIssueId } =
    useDisplayPreferenceStore(useShallow(s => ({
      preset:          s.preset,
      visiblePatterns: s.visiblePatterns,
      visibleIssueIds: s.visibleIssueIds,
      applyPreset:     s.applyPreset,
      togglePattern:   s.togglePattern,
      toggleIssueId:   s.toggleIssueId,
    })))

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">表示設定</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">変更種別チップ・問題チップの表示/非表示を設定</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-5">

          {/* プリセット */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">プリセット</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => applyPreset(p.value)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    preset === p.value
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 変更種別 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              変更種別チップ
              <span className="ml-1.5 text-blue-500 font-normal normal-case">
                {visiblePatterns.size} / {ALL_EDIT_PATTERNS.length}
              </span>
            </div>
            <div className="space-y-3">
              {PATTERN_GROUPS.map(({ label, patterns }) => (
                <div key={label}>
                  <div className="text-[10px] font-semibold text-gray-400 mb-1.5">{label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {patterns.map(key => {
                      const chip    = patternChipByKey.get(key)
                      const checked = visiblePatterns.has(key)
                      const meta    = EDIT_PATTERN_META[key]
                      return (
                        <button
                          key={key}
                          onClick={() => togglePattern(key)}
                          title={meta.description ?? meta.label}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] leading-none font-medium transition-all ${
                            checked
                              ? (chip?.color ?? 'bg-gray-100 text-gray-600 border-gray-200')
                              : 'bg-gray-100 text-gray-300 border-gray-200 line-through'
                          }`}
                        >
                          {chip?.label ?? meta.chipLabel}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 問題種別 */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              問題チップ
              <span className="ml-1.5 text-red-500 font-normal normal-case">
                {visibleIssueIds.size} / {ISSUE_TYPE_METAS.length}
              </span>
            </div>
            <div className="space-y-3">
              {ISSUE_GROUPS.map(({ label, group }) => {
                const metas = ISSUE_TYPE_METAS.filter(m => m.group === group)
                if (metas.length === 0) return null
                return (
                  <div key={group}>
                    <div className="text-[10px] font-semibold text-gray-400 mb-1.5">{label}</div>
                    <div className="space-y-1">
                      {metas.map(meta => {
                        const checked = visibleIssueIds.has(meta.id)
                        const colorOn = meta.level === 'error'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-amber-100 text-amber-700 border-amber-200'
                        return (
                          <button
                            key={meta.id}
                            onClick={() => toggleIssueId(meta.id)}
                            className={`w-full flex items-start gap-2 px-2 py-1 rounded border text-left transition-all ${
                              checked
                                ? colorOn
                                : 'bg-gray-50 text-gray-300 border-gray-200'
                            }`}
                          >
                            <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-semibold leading-none border mt-0.5 ${
                              checked
                                ? colorOn
                                : 'bg-gray-100 text-gray-300 border-gray-200 line-through'
                            }`}>
                              {meta.chipLabel}
                            </span>
                            <span className={`text-[11px] leading-snug ${checked ? '' : 'text-gray-300'}`}>
                              {meta.description}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* フッター */}
        <div className="flex justify-end px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => applyPreset('standard')}
            className="text-xs text-gray-400 hover:text-gray-600 mr-auto"
          >
            標準にリセット
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
