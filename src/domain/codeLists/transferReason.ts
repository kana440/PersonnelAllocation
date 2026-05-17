// 異動事由 — AllocationList.transferReason / Operation.transferReason
// CDカラムなし: code = label（異動事由テキストそのまま）
import type { CodeEntry } from './types'

export interface TransferReasonEntry extends CodeEntry {
  noCheckRequired:     boolean  // チェック不要サイン
  concurrentCheckSign: boolean  // 兼務チェックサイン
  note?:               string   // 備考
}
