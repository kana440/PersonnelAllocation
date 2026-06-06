// derivation/promotionFields.ts のテスト
import { describe, test, expect } from 'vitest'
import {
  derivePromotionSignFromLevel,
  derivePromotionSign,
  derivePayGradeChangeSign,
} from '@personnel/domain/derivation/promotionFields'
import { makeCL } from '../helpers/fixtures'

// ── derivePromotionSignFromLevel ──────────────────────────────────────────────
// payGrade の数字部分（Level）の変化から promotionSign を導出する

describe('derivePromotionSignFromLevel', () => {
  test('G3 → G4: Level が上がった → 昇格', () => {
    expect(derivePromotionSignFromLevel('G4', 'G3')).toEqual({ promotionSign: '1' })
  })

  test('G4 → G3: Level が下がった → 降格', () => {
    expect(derivePromotionSignFromLevel('G3', 'G4')).toEqual({ promotionSign: '1' })
  })

  test('G4 → G4: Level が同じ → 変化なし（空オブジェクト）', () => {
    expect(derivePromotionSignFromLevel('G4', 'G4')).toEqual({})
  })

  test('after が undefined → 変化なし', () => {
    expect(derivePromotionSignFromLevel(undefined, 'G4')).toEqual({})
  })

  test('prev が undefined → 変化なし', () => {
    expect(derivePromotionSignFromLevel('G4', undefined)).toEqual({})
  })
})

// ── derivePromotionSign ────────────────────────────────────────────────────────
// band の warningLevel 変化から promotionSign を導出する

describe('derivePromotionSign', () => {
  // MOCK_JOB_LEVELS: M3=warningLevel2, M4=warningLevel3, M6=warningLevel5
  const cl = makeCL()

  test('M4 → M6: warningLevel 上昇 → 昇格', () => {
    const result = derivePromotionSign('M6', 'M4', cl)
    expect(result.promotionSign).toBe('1')
  })

  test('M6 → M4: warningLevel 下降 → 降格', () => {
    const result = derivePromotionSign('M4', 'M6', cl)
    expect(result.promotionSign).toBe('1')
  })

  test('M4 → M4: 変化なし → promotionSign は undefined', () => {
    const result = derivePromotionSign('M4', 'M4', cl)
    expect(result.promotionSign).toBeUndefined()
  })

  test('マスタに存在しないバンド（warningLevel=0）→ promotionSign は undefined', () => {
    const result = derivePromotionSign('UNKNOWN', 'M4', cl)
    expect(result.promotionSign).toBeUndefined()
  })

  test('prevBand が undefined → promotionSign は undefined', () => {
    const result = derivePromotionSign('M4', undefined, cl)
    expect(result.promotionSign).toBeUndefined()
  })
})

// ── derivePayGradeChangeSign ──────────────────────────────────────────────────

describe('derivePayGradeChangeSign', () => {
  test('給与等級が変わった → payGradeChangeSign が設定される', () => {
    const result = derivePayGradeChangeSign('G5', 'G4')
    expect(result.payGradeChangeSign).toBeDefined()
  })

  test('給与等級が同じ → payGradeChangeSign は undefined', () => {
    const result = derivePayGradeChangeSign('G4', 'G4')
    expect(result.payGradeChangeSign).toBeUndefined()
  })

  test('after が undefined → payGradeChangeSign は undefined', () => {
    const result = derivePayGradeChangeSign(undefined, 'G4')
    expect(result.payGradeChangeSign).toBeUndefined()
  })
})
