// 異動事由 — AllocationList.transferReason / Operation.transferReason
import type { CodeEntry } from './types'

export interface TransferReasonEntry extends CodeEntry {
  // Whether this reason involves movement between companies (drives secondment flags)
  direction?: 'in' | 'out' | 'internal'
}
