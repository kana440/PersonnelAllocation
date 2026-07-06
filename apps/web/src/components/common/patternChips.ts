import { EDIT_PATTERN_META, ALL_EDIT_PATTERNS } from '@personnel/domain/patterns/editPattern'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'

// ── 変更パターンチップの色定義（UI層の責務）─────────────────────────────────────
// chipLabel は domain の EDIT_PATTERN_META から取得する（単一ソース）。
// 色だけをここで定義する。

const CHIP_COLORS: Record<EditPattern, string> = {
  // ── 職務情報系 ──────────────────────────────────────────────────────────────
  promotion:                      'bg-green-100 text-green-700 border-green-200',
  demotion:                       'bg-orange-100 text-orange-700 border-orange-200',
  bandChange:                     'bg-yellow-100 text-yellow-700 border-yellow-200',
  titleChange:                    'bg-yellow-100 text-yellow-700 border-yellow-200',
  mpTrackSwitch:                  'bg-violet-100 text-violet-700 border-violet-200',
  jobFamilyChange:                'bg-purple-200 text-purple-800 border-purple-300',
  jobTypeChange:                  'bg-purple-100 text-purple-700 border-purple-200',
  payGradeChange:                 'bg-purple-100 text-purple-700 border-purple-200',
  secondmentAcceptanceModeSwitch: 'bg-amber-100 text-amber-700 border-amber-200',
  employmentExtension:            'bg-purple-50 text-purple-600 border-purple-100',
  employmentTypeChange:           'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  // ── ポジション系 ─────────────────────────────────────────────────────────────
  orgTransfer:                    'bg-blue-100 text-blue-700 border-blue-200',
  orgRestructure:                 'bg-indigo-100 text-indigo-700 border-indigo-200',
  positionChange:                 'bg-cyan-100 text-cyan-700 border-cyan-200',
  managerChange:                  'bg-blue-50 text-blue-600 border-blue-100',
  newPosition:                    'bg-teal-100 text-teal-700 border-teal-200',
  concurrentAdd:                  'bg-cyan-100 text-cyan-700 border-cyan-200',
  concurrentRelease:              'bg-red-50 text-red-600 border-red-100',
  // ── 出向系（本務）────────────────────────────────────────────────────────────
  secondmentOut:                  'bg-amber-100 text-amber-700 border-amber-200',
  secondmentIn:                   'bg-amber-50 text-amber-600 border-amber-100',
  secondmentOutRelease:           'bg-red-100 text-red-600 border-red-200',
  secondmentInRelease:            'bg-red-100 text-red-600 border-red-200',
  // ── 出向系（兼務）────────────────────────────────────────────────────────────
  concurrentSecondmentOutNonSF:   'bg-amber-100 text-amber-700 border-amber-200',
  concurrentSecondmentIn:         'bg-amber-50 text-amber-600 border-amber-100',
  concurrentSecondmentOutRelease: 'bg-red-100 text-red-600 border-red-200',
  concurrentSecondmentInRelease:  'bg-red-50 text-red-600 border-red-100',
  // ── 人操作系 ─────────────────────────────────────────────────────────────────
  leaveOfAbsence:                 'bg-gray-100 text-gray-600 border-gray-200',
  returnFromLeave:                'bg-gray-100 text-gray-600 border-gray-200',
  executiveAppointment:           'bg-emerald-100 text-emerald-700 border-emerald-200',
  employmentTransfer:             'bg-red-50 text-red-600 border-red-100',
  termination:                    'bg-red-100 text-red-700 border-red-200',
  noChange:                       'bg-neutral-100 text-neutral-500 border-neutral-200',
}

export interface PatternChipDef {
  key:   EditPattern
  label: string
  color: string
}

/** 全34パターンのチップ定義。chipLabel はドメインから、色は UI 層で定義。 */
export const PATTERN_CHIP_DEFS: PatternChipDef[] = ALL_EDIT_PATTERNS.map(key => ({
  key,
  label: EDIT_PATTERN_META[key].chipLabel,
  color: CHIP_COLORS[key],
}))

export const PATTERN_LABEL_MAP: Partial<Record<EditPattern, string>> = Object.fromEntries(
  PATTERN_CHIP_DEFS.map(d => [d.key, d.label])
) as Partial<Record<EditPattern, string>>

export const PATTERN_COLOR_MAP: Partial<Record<EditPattern, string>> = Object.fromEntries(
  PATTERN_CHIP_DEFS.map(d => [d.key, d.color])
) as Partial<Record<EditPattern, string>>
