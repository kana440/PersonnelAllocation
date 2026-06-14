import type { AllocationRow } from '../../allocationRow'
import { EMPTY_CODE_LISTS }   from '../../masters/aggregate'
import type { EditPattern }   from '../defs'
import { ALL_EDIT_PATTERNS, EDIT_PATTERN_META } from '../defs'
import { parseBandLevel, parsePositionBandRange } from './helpers'
import type { DetectContext } from './helpers'

export type { DetectContext } from './helpers'

export interface RowChanges {
  /** 検出された変更パターン */
  patterns:     Set<EditPattern>
  bandMismatch: boolean
  diffCount:    number
}

const EMPTY_CTX: DetectContext = {
  allocationList:     [],
  afterOrganizations: [],
  codeLists:          EMPTY_CODE_LISTS,
}

export function detectPatterns(row: AllocationRow, ctx?: DetectContext): RowChanges {
  const effectiveCtx = ctx ?? EMPTY_CTX

  const patterns = new Set<EditPattern>()
  for (const p of ALL_EDIT_PATTERNS) {
    if (p === 'noChange') continue  // 後処理で制御
    if (EDIT_PATTERN_META[p].detect(row, effectiveCtx)) {
      patterns.add(p)
    }
  }

  // 変更なし: transferReason あり・主要フィールド差分なし・他パターンなし
  const tr = (row.transferReason as string | undefined) ?? ''
  const hasNoFieldDiff =
    (row.departmentCode ?? '') === (row.prevDepartmentCode ?? '') &&
    (row.band           ?? '') === (row.prevBand           ?? '') &&
    (row.positionCode   ?? '') === (row.prevPositionCode   ?? '') &&
    (row.employmentType ?? '') === (row.prevEmploymentType ?? '') &&
    (row.concurrentType ?? '') === (row.prevConcurrentType ?? '')
  if (tr && hasNoFieldDiff && patterns.size === 0) {
    patterns.add('noChange')
  }

  // bandMismatch: band が positionBand 範囲外かチェック
  const afterBandLevel = parseBandLevel(row.band)
  let bandMismatch = false
  if (afterBandLevel !== null) {
    const range = parsePositionBandRange(row.positionBand)
    if (range) bandMismatch = afterBandLevel < range[0] || afterBandLevel > range[1]
  }

  // diffCount: 主要フィールドの変更数
  const keyPairs: Array<[keyof AllocationRow, keyof AllocationRow]> = [
    ['departmentCode', 'prevDepartmentCode'],
    ['band',           'prevBand'],
    ['localJobTitle',  'prevLocalJobTitle'],
    ['positionCode',   'prevPositionCode'],
    ['positionBand',   'prevPositionBand'],
    ['concurrentType', 'prevConcurrentType'],
    ['employmentType', 'prevEmploymentType'],
  ]
  let diffCount = 0
  for (const [after, before] of keyPairs) {
    if ((row[after] ?? '') !== (row[before] ?? '')) diffCount++
  }

  return { patterns, bandMismatch, diffCount }
}
