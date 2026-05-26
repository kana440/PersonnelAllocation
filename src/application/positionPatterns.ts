// Position-level pattern detection — cross-allocation comparisons.
//
// This is distinct from the existing IOperationPattern system (which groups
// rows by groupEmployeeId for per-person multi-row patterns).
// Here we detect patterns that emerge when comparing positions across ALL rows:
// e.g., a different person is now occupying a position that had someone else before.
//
// Design principles:
//   - Build indices ONCE per allocationList snapshot (PositionContext).
//   - Detectors are pure functions: (row, ctx) => PositionBadge | null
//   - Adding a new detector = append one function to POSITION_DETECTORS.

import type { AllocationRow } from '../domain/allocationRow'
import { parseBandLevel } from '../domain/review/changeDetection'

// ── Context (built once, reused by all detectors) ─────────────────────────────

export interface PositionContext {
  /** positionCode → userId of the primary occupant BEFORE changes (from prevPositionCode) */
  prevOccupantByPosCode: Map<string, string>
}

export function buildPositionContext(list: AllocationRow[]): PositionContext {
  const prevOccupantByPosCode = new Map<string, string>()

  for (const row of list) {
    if (!row.userId) continue
    if (row.prevPositionCode && row.prevConcurrentType !== '兼務')
      prevOccupantByPosCode.set(row.prevPositionCode, row.userId)
  }

  return { prevOccupantByPosCode }
}

// ── Badge type ────────────────────────────────────────────────────────────────

export interface PositionBadge {
  kind:  string
  label: string
  /** Tailwind color classes for the badge pill */
  color: string
}

// ── Detector type ─────────────────────────────────────────────────────────────

export type PositionPatternDetector = (
  row: AllocationRow,
  ctx: PositionContext,
) => PositionBadge | null

// ── Detector: 着任（既存ポジションへ別メンバーが着任） ───────────────────────
//
// Condition: The current occupant of positionCode X differs from whoever
// was in X before (as recorded by prevPositionCode on some other row).
// This covers: successor appointment, internal transfer into an existing role.
const successionDetector: PositionPatternDetector = (row, ctx) => {
  if (!row.positionCode || !row.userId || row.concurrentType === '兼務') return null
  const prevOccupant = ctx.prevOccupantByPosCode.get(row.positionCode)
  // No previous occupant = vacant-fill, not a succession
  if (!prevOccupant) return null
  // Same person stayed → no change
  if (prevOccupant === row.userId) return null
  return { kind: 'succession', label: '着任', color: 'bg-indigo-100 text-indigo-700' }
}

// ── Detector: 昇格・降格（band の数値レベル変化） ─────────────────────────────
//
// parseBandLevel は changeDetection.ts と共有。数値比較できない場合は「職位変更」。
const bandChangeDetector: PositionPatternDetector = (row, _ctx) => {
  if (!row.userId || row.concurrentType === '兼務') return null
  const after  = row.band
  const before = row.prevBand
  if (!after || !before || after === before) return null

  const afterLevel  = parseBandLevel(after)
  const beforeLevel = parseBandLevel(before)

  if (afterLevel !== null && beforeLevel !== null) {
    if (afterLevel > beforeLevel) return { kind: 'promotion', label: '昇格', color: 'bg-green-100 text-green-700' }
    if (afterLevel < beforeLevel) return { kind: 'demotion',  label: '降格', color: 'bg-orange-100 text-orange-700' }
  }
  return { kind: 'bandChange', label: '職位変更', color: 'bg-yellow-100 text-yellow-700' }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const POSITION_DETECTORS: PositionPatternDetector[] = [
  successionDetector,
  bandChangeDetector,
]

export function detectPositionPatterns(
  row: AllocationRow,
  ctx: PositionContext,
): PositionBadge[] {
  return POSITION_DETECTORS.flatMap(d => {
    const r = d(row, ctx)
    return r ? [r] : []
  })
}
