// @deprecated: deriveEditPatterns は detectPatterns() に統合されました
// 新コードは @personnel/domain/patterns/detection の detectPatterns を使ってください
import type { AllocationRow } from '../allocationRow'
import { detectPatterns } from './detection'
import { ALL_EDIT_PATTERNS, type EditPattern } from './defs'

export function deriveEditPatterns(
  _kinds: Set<string>,
  row: AllocationRow,
  _masters?: unknown,
): { active: EditPattern[]; available: EditPattern[] } {
  const active = detectPatterns(row).patterns
  return {
    active:    ALL_EDIT_PATTERNS.filter(p =>  active.has(p)),
    available: ALL_EDIT_PATTERNS.filter(p => !active.has(p)),
  }
}
