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

// ── Context (built once, reused by all detectors) ─────────────────────────────

export interface PositionContext {
  /** positionCode → userId of the primary occupant BEFORE changes (from prevPositionCode) */
  prevOccupantByPosCode: Map<string, string>
  /** positionCode → userId of the primary occupant AFTER changes (from positionCode) */
  currOccupantByPosCode: Map<string, string>
}

export function buildPositionContext(list: AllocationRow[]): PositionContext {
  const prevOccupantByPosCode = new Map<string, string>()
  const currOccupantByPosCode = new Map<string, string>()

  for (const row of list) {
    if (!row.userId) continue
    // Before state: this person was in prevPositionCode before the change
    if (row.prevPositionCode && row.prevConcurrentType !== '兼務')
      prevOccupantByPosCode.set(row.prevPositionCode, row.userId)
    // After state: this person is now in positionCode
    if (row.positionCode && row.concurrentType !== '兼務')
      currOccupantByPosCode.set(row.positionCode, row.userId)
  }

  return { prevOccupantByPosCode, currOccupantByPosCode }
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

// ── Detector: 離任（ポジションにいた人が別ポジション/未アサインへ移動） ───────
//
// Condition: Someone was in position X before (prevPositionCode=X),
// but is now in a DIFFERENT position (positionCode ≠ X, or no positionCode).
const departureDector: PositionPatternDetector = (row, ctx) => {
  if (!row.prevPositionCode || !row.userId || row.prevConcurrentType === '兼務') return null
  const movedAway = row.positionCode !== row.prevPositionCode
  if (!movedAway) return null
  // Confirm someone else (or vacancy) is now in that prev position
  const nowInPrev = ctx.currOccupantByPosCode.get(row.prevPositionCode)
  // If the same person is still the occupant (no change was recorded for that pos) skip
  if (nowInPrev === row.userId) return null
  return { kind: 'departure', label: '離任', color: 'bg-amber-100 text-amber-700' }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const POSITION_DETECTORS: PositionPatternDetector[] = [
  successionDetector,
  departureDector,
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
