import type { AllocationRow } from '../../allocationRow'
import type { DomainContext }  from '../../context'

// ── DetectContext ─────────────────────────────────────────────────────────────

export interface DetectContext extends DomainContext {
  readonly sameOrgPairs?: Set<string>
}

// ── noCheckRequired ヘルパー ─────────────────────────────────────────────────
// 異動事由マスタで noCheckRequired=true の場合はフィールド差分を検知せず、
// 異動事由の宣言に基づいてパターンを判定する。

export function isNoCheckReason(row: AllocationRow, ctx: DetectContext): boolean {
  const tr = row.transferReason as string | undefined
  if (!tr) return false
  return ctx.masters.transferReasons.some(r => r.label === tr && r.noCheckRequired)
}

// ── バンド比較ヘルパー ────────────────────────────────────────────────────────

/**
 * jobLevels マスタの promotionDemotionWarningLevel でバンドの方向を比較する。
 * - 0 は「比較不可」を意味するため、どちらかが 0 なら null を返す
 * - 両方 non-zero で等しい場合は 'same'（昇降格なし）
 */
export function compareBandLevels(
  prev:  string | undefined,
  after: string | undefined,
  ctx:   DetectContext,
): 'up' | 'down' | 'same' | null {
  const level = (label: string | undefined): number =>
    ctx.masters.jobLevels.find(e => e.label === label)?.promotionDemotionWarningLevel ?? 0
  const p = level(prev)
  const a = level(after)
  if (p === 0 || a === 0) return null
  if (a > p) return 'up'
  if (a < p) return 'down'
  return 'same'
}

// ── 後方互換（旧文字列パース方式）────────────────────────────────────────────

// バンド文字列から数値レベルを抽出（例: "M4" → 4, "G3" → 3, "4" → 4）
export function parseBandLevel(band: string | undefined | null): number | null {
  if (!band) return null
  const m = band.trim().match(/(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return isNaN(n) ? null : n
}

// ポジションバンド範囲から [min, max] を抽出（例: "M4-M6" → [4, 6], "M4" → [4, 4]）
export function parsePositionBandRange(positionBand: string | undefined | null): [number, number] | null {
  if (!positionBand) return null
  const parts = positionBand.trim().split(/[-~]/)
  const nums = parts.map(p => parseBandLevel(p)).filter((n): n is number => n !== null)
  if (nums.length === 0) return null
  return [Math.min(...nums), Math.max(...nums)]
}
