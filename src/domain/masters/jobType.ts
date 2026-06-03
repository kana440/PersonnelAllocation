// JobTypeCd — Position.jobTypeCode（JobFamily の配下。業務上「JobType」と呼ばれる）
// JobType テーブル(AR-AU) → jobTypes
import type { CodeEntry } from './types'

export interface JobTypeEntry extends CodeEntry {
  jobFamilyCode:         string   // 親 JobFamilyCD (= 職種CD)
  isDiscretionaryTarget: boolean  // 裁量対象サイン
  compensationCategory:  string   // 報酬区分
}
