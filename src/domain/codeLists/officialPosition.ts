// 役職CD — AllocationList.officialPositionCode / Position.title
import type { CodeEntry } from './types'

export interface OfficialPositionEntry extends CodeEntry {
  isManager?: boolean   // 管理職フラグ: affects HR approval rules
  rankLevel?: number    // relative rank for promotion/demotion comparison logic
}
