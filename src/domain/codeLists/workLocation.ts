// 勤務場所CD — AllocationList.location / Position.workLocation
import type { CodeEntry } from './types'

export interface WorkLocationEntry extends CodeEntry {
  region?: string   // 地域 (e.g. '東京', '大阪')
  country?: string  // ISO country code (e.g. 'JP', 'US')
}
