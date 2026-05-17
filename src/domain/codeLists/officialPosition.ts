// 役職CD — AllocationList.officialPositionCode / Position.title
import type { CodeEntry } from './types'

export interface OfficialPositionEntry extends CodeEntry {
  isFreeTitle:           boolean  // フリータイトル (役職名を自由入力可)
  isDiscretionaryTarget: boolean  // 裁量対象サイン
}
