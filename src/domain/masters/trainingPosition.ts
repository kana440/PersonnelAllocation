// 業務研修ポジション — AllocationList.trainingPositionFlag
import type { CodeEntry } from './types'

export type TrainingPositionEntry = CodeEntry

export const TRAINING_POSITION_YES = 'はい'
export const TRAINING_POSITION_NO  = 'いいえ'
export const TRAINING_POSITION_VALUES = [TRAINING_POSITION_YES, TRAINING_POSITION_NO] as const
