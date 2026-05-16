// 職務レベルCD (ポジションバンド) — AllocationList.positionBand / Position.band
import type { CodeEntry } from './types'

export interface JobLevelEntry extends CodeEntry {
  numericLevel?: number  // for ordering and promotion/demotion detection comparisons
}
