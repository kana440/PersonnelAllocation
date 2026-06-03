// 職務レベルCD (ポジションバンド) — AllocationList.positionBand / Position.band
import type { CodeEntry } from './types'

export interface JobLevelEntry extends CodeEntry {
  promotionDemotionBand?:                    string   // 昇降格判定読み替えバンド (出向受入等は空)
  promotionDemotionWarningLevel:             number   // 昇降格ワーニング用チェック (0/2/3)
  isSecondmentAcceptance:                     boolean  // 出向受入チェック
  isRegularEmployee:                                boolean  // 社員チェック
  isExtendedEmployeePosition:             boolean  // 雇用延長チェック(position)
  isExtendedEmployeeJobClassification:    boolean  // 雇用延長チェック(JobClassification)
  isRegularEmployeeOrSecondmentAcceptance:           boolean  // 社員・受入組合員チェック
  isExtendedEmployeeUnionMember:          boolean  // 雇用延長組合員チェック（JobClassification)
  isDiscretionaryTarget:                     number   // 裁量対象サイン (0/1/2)
}
