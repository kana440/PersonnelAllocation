// patterns/changeDetection.ts のテスト
import { describe, test, expect } from 'vitest'
import {
  detectChanges,
  parseBandLevel,
  parsePositionBandRange,
} from '@personnel/domain/patterns/changeDetection'
import { makeRow } from '../helpers/fixtures'

// ── parseBandLevel ────────────────────────────────────────────────────────────

describe('parseBandLevel', () => {
  test.each([
    ['M4',  4],
    ['G3',  3],
    ['E1',  1],
    ['4',   4],
    ['OM3', 3],
  ])('%s → %i', (input, expected) => {
    expect(parseBandLevel(input)).toBe(expected)
  })

  test.each([null, undefined, '', 'X'])('数値なし "%s" → null', (input) => {
    expect(parseBandLevel(input as string)).toBeNull()
  })
})

// ── parsePositionBandRange ────────────────────────────────────────────────────

describe('parsePositionBandRange', () => {
  test('M4-M6 → [4, 6]', () => {
    expect(parsePositionBandRange('M4-M6')).toEqual([4, 6])
  })

  test('M4 → [4, 4]（単一値）', () => {
    expect(parsePositionBandRange('M4')).toEqual([4, 4])
  })

  test('null → null', () => {
    expect(parsePositionBandRange(null)).toBeNull()
  })
})

// ── detectChanges ─────────────────────────────────────────────────────────────

describe('detectChanges: 組織変更', () => {
  test('組織コードが変わったとき transfer', () => {
    const row = makeRow({ prevDepartmentCode: 'ORG001', departmentCode: 'ORG002' })
    const { kinds } = detectChanges(row)
    expect(kinds.has('transfer')).toBe(true)
  })

  test('組織コードが同じなら transfer なし', () => {
    const row = makeRow({ prevDepartmentCode: 'ORG001', departmentCode: 'ORG001' })
    const { kinds } = detectChanges(row)
    expect(kinds.has('transfer')).toBe(false)
  })

  test('sameOrgPairs に含まれる移動は transfer なし', () => {
    const row   = makeRow({ prevDepartmentCode: 'ORG001', departmentCode: 'ORG002' })
    const pairs = new Set(['ORG001|ORG002'])
    const { kinds } = detectChanges(row, pairs)
    expect(kinds.has('transfer')).toBe(false)
  })
})

describe('detectChanges: 昇降格', () => {
  test('band が上昇したとき promotion', () => {
    const row = makeRow({ prevBand: 'M4', band: 'M5' })
    const { kinds } = detectChanges(row)
    expect(kinds.has('promotion')).toBe(true)
    expect(kinds.has('demotion')).toBe(false)
  })

  test('band が下降したとき demotion', () => {
    const row = makeRow({ prevBand: 'M5', band: 'M4' })
    const { kinds } = detectChanges(row)
    expect(kinds.has('demotion')).toBe(true)
    expect(kinds.has('promotion')).toBe(false)
  })

  test('band が数値として比較できないとき bandChange', () => {
    const row = makeRow({ prevBand: 'M4', band: 'G4' })
    const { kinds } = detectChanges(row)
    // M=4, G=4 → 数値は同じなので bandChange
    expect(kinds.has('bandChange')).toBe(true)
  })

  test('band 変更なし → 昇降格なし', () => {
    const row = makeRow({ prevBand: 'M4', band: 'M4' })
    const { kinds } = detectChanges(row)
    expect(kinds.has('promotion')).toBe(false)
    expect(kinds.has('demotion')).toBe(false)
    expect(kinds.has('bandChange')).toBe(false)
  })
})

describe('detectChanges: その他の変更種別', () => {
  test('localJobTitle 変更 → titleChange', () => {
    const row = makeRow({ prevLocalJobTitle: '旧肩書', localJobTitle: '新肩書' })
    expect(detectChanges(row).kinds.has('titleChange')).toBe(true)
  })

  test('positionCode 変更 → positionChange', () => {
    const row = makeRow({ prevPositionCode: 'P001', positionCode: 'P002' })
    expect(detectChanges(row).kinds.has('positionChange')).toBe(true)
  })

  test('prevDepartmentCode なし + userId あり → newHire', () => {
    const row = makeRow({ prevDepartmentCode: undefined, userId: 'u1' })
    expect(detectChanges(row).kinds.has('newHire')).toBe(true)
  })

  test('prevDepartmentCode あり + userId なし + departmentCode なし → termination', () => {
    const row = makeRow({ prevDepartmentCode: 'ORG001', userId: undefined, departmentCode: undefined })
    expect(detectChanges(row).kinds.has('termination')).toBe(true)
  })

  test('兼務行 → concurrent', () => {
    const row = makeRow({ concurrentType: '兼務' })
    expect(detectChanges(row).kinds.has('concurrent')).toBe(true)
  })
})

describe('detectChanges: bandMismatch', () => {
  test('band が positionBand 範囲内 → mismatch なし', () => {
    const row = makeRow({ band: 'M4', positionBand: 'M3-M5' })
    expect(detectChanges(row).bandMismatch).toBe(false)
  })

  test('band が positionBand 範囲外 → mismatch あり', () => {
    const row = makeRow({ band: 'M6', positionBand: 'M3-M5' })
    expect(detectChanges(row).bandMismatch).toBe(true)
  })

  test('positionBand なし → mismatch なし', () => {
    const row = makeRow({ band: 'M4', positionBand: undefined })
    expect(detectChanges(row).bandMismatch).toBe(false)
  })
})
