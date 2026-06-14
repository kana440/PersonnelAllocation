export type { EditPatternMeta } from './types'

export type EditPattern =
  // 職務情報系
  | 'promotion'
  | 'demotion'
  | 'titleChange'
  | 'jobTypeChange'
  | 'employmentExtension'
  // ポジション系
  | 'orgTransfer'
  | 'orgRestructure'
  | 'managerChange'
  | 'concurrentAdd'
  | 'concurrentRelease'
  // 出向系（本務）
  | 'secondmentOut'
  | 'secondmentIn'
  | 'secondmentOutRelease'
  | 'secondmentInRelease'
  // 出向系（兼務）
  | 'concurrentSecondmentOut'
  | 'concurrentSecondmentIn'
  | 'concurrentSecondmentOutRelease'
  | 'concurrentSecondmentInRelease'
  // 人操作系
  | 'leaveOfAbsence'
  | 'returnFromLeave'
  | 'employmentTransferOut'
  | 'employmentTransferIn'
  | 'newHire'
  | 'termination'
  | 'noChange'
  // 既存（後方互換）
  | 'resignation'
  | 'vacantPositionMove'

export const ALL_EDIT_PATTERNS: EditPattern[] = [
  'promotion', 'demotion', 'titleChange', 'jobTypeChange', 'employmentExtension',
  'orgTransfer', 'orgRestructure', 'managerChange', 'concurrentAdd', 'concurrentRelease',
  'secondmentOut', 'secondmentIn', 'secondmentOutRelease', 'secondmentInRelease',
  'concurrentSecondmentOut', 'concurrentSecondmentIn',
  'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
  'leaveOfAbsence', 'returnFromLeave',
  'employmentTransferOut', 'employmentTransferIn',
  'newHire', 'termination', 'noChange',
  'resignation', 'vacantPositionMove',
]

import type { EditPatternMeta } from './types'
import { JOB_CLASSIFICATION_META } from './jobClassification'
import { POSITION_META }           from './position'
import { SECONDMENT_META }         from './secondment'
import { PERSON_META }             from './person'
import { LEGACY_META }             from './legacy'

export const EDIT_PATTERN_META: Record<EditPattern, EditPatternMeta> = {
  ...JOB_CLASSIFICATION_META,
  ...POSITION_META,
  ...SECONDMENT_META,
  ...PERSON_META,
  ...LEGACY_META,
} as Record<EditPattern, EditPatternMeta>
