// 職種CD — AllocationList.jobType / Position.jobType
import type { CodeEntry } from './types'

export interface JobTypeEntry extends CodeEntry {
  jobFamilyCode?:    string  // parent JobFamilyCD
  subJobFamilyCode?: string  // parent SubJobFamilyCd (if applicable)
}
