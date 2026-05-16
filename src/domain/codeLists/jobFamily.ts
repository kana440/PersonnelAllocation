// JobFamilyCD + SubJobFamilyCd — AllocationList.jobFamily / subJobFamily / Position.jobFamily / subJobFamilyCode
import type { CodeEntry } from './types'

export type JobFamilyEntry = CodeEntry

export interface SubJobFamilyEntry extends CodeEntry {
  jobFamilyCode: string  // parent JobFamilyCD — required for hierarchy traversal
}
