// JobFamilyCD (= 職種) / SubJobFamilyCd — Position.jobFamily / subJobFamilyCode
// 職種テーブル(AM-AN) → jobFamilies
// SubJobFamily テーブル(AR-AU) → subJobFamilies
import type { CodeEntry } from './types'

export type JobFamilyEntry = CodeEntry

export interface SubJobFamilyEntry extends CodeEntry {
  jobFamilyCode:         string   // 親 JobFamilyCD (= 職種CD)
  isDiscretionaryTarget: boolean  // 裁量対象サイン
  compensationCategory:  string   // 報酬区分
}
