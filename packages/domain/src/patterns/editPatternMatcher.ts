// @deprecated: deriveEditPatterns は detectPatterns() に統合されました
// 新コードは @personnel/domain/patterns/detection の detectPatterns を使ってください
import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../masters/aggregate'
import { detectPatterns } from './detection'
import { EDIT_PATTERN_META, ALL_EDIT_PATTERNS, type EditPattern } from './defs'

export function deriveEditPatterns(
  _kinds: Set<string>,
  row: AllocationRow,
  codeLists?: AllCodeLists,
): { active: EditPattern[]; available: EditPattern[] } {
  const active = detectPatterns(row).patterns
  const canAdd = (p: EditPattern): boolean => {
    if (!codeLists) return true
    const cond = EDIT_PATTERN_META[p].availableFor
    return cond === undefined || cond(row, codeLists)
  }
  return {
    active:    ALL_EDIT_PATTERNS.filter(p =>  active.has(p)),
    available: ALL_EDIT_PATTERNS.filter(p => !active.has(p) && canAdd(p)),
  }
}
