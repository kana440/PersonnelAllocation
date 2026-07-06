export type { EditPatternMeta } from './types'

export type EditPattern =
  // 職務情報系
  | 'promotion'
  | 'demotion'
  | 'bandChange'              // バンドが変わったが昇降格判定不可
  | 'titleChange'
  | 'mpTrackSwitch'
  | 'jobFamilyChange'                 // ジョブファミリー変更（JF変化時に優先）
  | 'jobTypeChange'
  | 'payGradeChange'                  // 給与等級変更
  | 'secondmentAcceptanceModeSwitch'  // 出向受入の本務↔兼務切替
  | 'employmentExtension'
  | 'employmentTypeChange'
  // ポジション系
  | 'orgTransfer'
  | 'orgRestructure'
  | 'positionChange'  // Pos変更
  | 'managerChange'
  | 'newPosition'
  | 'concurrentAdd'
  | 'concurrentRelease'
  // 出向系（本務）
  | 'secondmentOut'
  | 'secondmentIn'
  | 'secondmentOutRelease'
  | 'secondmentInRelease'
  // 出向系（兼務）
  | 'concurrentSecondmentOutNonSF'
  | 'concurrentSecondmentIn'
  | 'concurrentSecondmentOutRelease'
  | 'concurrentSecondmentInRelease'
  // 人操作系
  | 'leaveOfAbsence'
  | 'returnFromLeave'
  | 'executiveAppointment'
  | 'employmentTransfer'
  | 'termination'
  | 'noChange'

export const ALL_EDIT_PATTERNS: EditPattern[] = [
  'promotion', 'demotion',
  'bandChange',
  'titleChange', 'mpTrackSwitch', 'jobFamilyChange', 'jobTypeChange', 'payGradeChange', 'secondmentAcceptanceModeSwitch', 'employmentExtension', 'employmentTypeChange',
  'orgTransfer', 'orgRestructure', 'positionChange', 'managerChange', 'newPosition', 'concurrentAdd', 'concurrentRelease',
  'secondmentOut', 'secondmentIn', 'secondmentOutRelease', 'secondmentInRelease',
  'concurrentSecondmentOutNonSF', 'concurrentSecondmentIn',
  'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
  'leaveOfAbsence', 'returnFromLeave',
  'executiveAppointment', 'employmentTransfer', 'termination', 'noChange',
]

import type { EditPatternMeta } from './types'
import { JOB_CLASSIFICATION_META } from './jobClassification'
import { POSITION_META }           from './position'
import { SECONDMENT_META }         from './secondment'
import { PERSON_META }             from './person'

export const EDIT_PATTERN_META: Record<EditPattern, EditPatternMeta> = {
  ...JOB_CLASSIFICATION_META,
  ...POSITION_META,
  ...SECONDMENT_META,
  ...PERSON_META,
} as Record<EditPattern, EditPatternMeta>
