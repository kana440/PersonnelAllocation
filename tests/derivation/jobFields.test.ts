// derivation/jobFields.ts + deriveFieldUpdates 統合テスト
import { describe, test, expect } from 'vitest'
import { computePayGrade, deriveOnJobFamilyChange, derivePayGradeFromJobType } from '../../src/domain/derivation/jobFields'
import { deriveFieldUpdates } from '../../src/domain/derivation/index'
import { makeRow, makeCL } from '../helpers/fixtures'

// ── computePayGrade ────────────────────────────────────────────────────────────
// jobType + band の compensationCategory が一致する payGrade を返す

describe('computePayGrade', () => {
  // MOCK_JOB_TYPES: SJF1(label='SE', compensationCategory='') → compensationCategory が空なので導出不可
  // テスト用に compensationCategory を持つエントリを追加して検証する

  test('jobType に compensationCategory がない → undefined', () => {
    const cl = makeCL()
    // MOCK の SE は compensationCategory='' なので undefined になる
    expect(computePayGrade('SE', 'M4', cl)).toBeUndefined()
  })

  test('jobType が存在しない → undefined', () => {
    const cl = makeCL()
    expect(computePayGrade('UNKNOWN', 'M4', cl)).toBeUndefined()
  })

  test('compensationCategory が一致する payGrade を返す', () => {
    const cl = makeCL({
      jobTypes: [{ code: 'JT1', label: 'エンジニア', jobFamilyCode: 'JF1', isDiscretionaryTarget: false, compensationCategory: 'X' }],
      payGrades: [{ code: 'PG1', label: 'GX4', compensationCategory: 'X', band: 'M4', isRegularEmployee: true, isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }],
    })
    expect(computePayGrade('エンジニア', 'M4', cl)).toBe('GX4')
  })

  test('band が一致しない → undefined', () => {
    const cl = makeCL({
      jobTypes: [{ code: 'JT1', label: 'エンジニア', jobFamilyCode: 'JF1', isDiscretionaryTarget: false, compensationCategory: 'X' }],
      payGrades: [{ code: 'PG1', label: 'GX4', compensationCategory: 'X', band: 'M5', isRegularEmployee: true, isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }],
    })
    expect(computePayGrade('エンジニア', 'M4', cl)).toBeUndefined()
  })
})

// ── deriveOnJobFamilyChange ───────────────────────────────────────────────────

describe('deriveOnJobFamilyChange', () => {
  test('jobType と payGrade をリセットする', () => {
    expect(deriveOnJobFamilyChange()).toEqual({ jobType: undefined, payGrade: undefined })
  })
})

// ── deriveFieldUpdates（統合）────────────────────────────────────────────────
// 変更トリガーから連動する自動導出を検証する

describe('deriveFieldUpdates', () => {
  const cl = makeCL()

  test('departmentCode 変更 → 組織サブフィールドが設定される', () => {
    const row    = makeRow({ departmentCode: undefined })
    const result = deriveFieldUpdates({ departmentCode: 'ORG001' }, row, cl)
    expect(result.businessUnit).toBeDefined()
    expect(result.costCenter).toBeDefined()
  })

  test('managerPositionCode 変更 → managerName が設定される', () => {
    const mgrRow = makeRow({ positionCode: 'P_MGR', userId: 'u1', lastName: '田中', firstName: '部長' })
    const row    = makeRow({})
    const result = deriveFieldUpdates({ managerPositionCode: 'P_MGR' }, row, cl, [mgrRow])
    expect(result.managerName).toBe('田中, 部長')
  })

  test('managerPositionCode を空に → managerName が undefined', () => {
    const row    = makeRow({ managerName: '田中, 部長' })
    const result = deriveFieldUpdates({ managerPositionCode: undefined }, row, cl)
    expect(result.managerName).toBeUndefined()
  })

  test('band 変更 → promotionSign が導出される（warningLevel が変化する場合）', () => {
    const row    = makeRow({ prevBand: 'M4', band: 'M4', employmentType: '社員', userId: '111', groupEmployeeId: '111' })
    const result = deriveFieldUpdates({ band: 'M6' }, row, cl)
    // M4(warningLevel=3) → M6(warningLevel=5): 昇格
    expect(result.promotionSign).toBe('1')
  })

  test('jobFamily 変更 → jobType・payGrade がリセットされる', () => {
    const row    = makeRow({ jobFamily: 'エンジニアリング', jobType: 'SE', payGrade: 'G4' })
    const result = deriveFieldUpdates({ jobFamily: '別の職種' }, row, cl)
    expect(result.jobType).toBeUndefined()
    expect(result.payGrade).toBeUndefined()
  })

  test('変更がないフィールドは導出結果に含まれない', () => {
    const row    = makeRow({})
    const result = deriveFieldUpdates({ officialPositionCode: '部長' }, row, cl)
    // officialPositionCode は導出トリガーでないので他フィールドへの影響なし
    expect(Object.keys(result)).toHaveLength(0)
  })
})
