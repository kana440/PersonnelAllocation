// fieldConstraints.ts の payGrade 絞り込みロジックのテスト
// getGroupedFieldOptions('payGrade', row, masters) を通して検証する
import { describe, test, expect } from 'vitest'
import { getGroupedFieldOptions } from '@personnel/domain/choices'
import { makePersonRow, makeCL } from '../helpers/fixtures'
import type { PayGradeEntry } from '@personnel/domain/masters/payGrade'
import type { JobLevelEntry } from '@personnel/domain/masters/jobLevel'
import type { JobTypeEntry }  from '@personnel/domain/masters/jobType'
import { MOCK_EMP_TYPES } from '../helpers/fixtures'

// ── テスト用マスタ ──────────────────────────────────────────────────────────────
// promotionDemotionBand が設定されている jobLevel
const JL_M4: JobLevelEntry = {
  code: 'M4', label: 'M4',
  promotionDemotionBand: 'M4',
  promotionDemotionWarningLevel: 3,
  isRegularEmployee: true, isSecondmentAcceptance: false,
  isExtendedEmployeePosition: false, isExtendedEmployeeJobClassification: false,
  isRegularEmployeeOrSecondmentAcceptance: true, isExtendedEmployeeUnionMember: false,
  isDiscretionaryTarget: 0,
}
const JL_M5: JobLevelEntry = {
  code: 'M5', label: 'M5',
  promotionDemotionBand: 'M5',
  promotionDemotionWarningLevel: 4,
  isRegularEmployee: true, isSecondmentAcceptance: false,
  isExtendedEmployeePosition: false, isExtendedEmployeeJobClassification: false,
  isRegularEmployeeOrSecondmentAcceptance: true, isExtendedEmployeeUnionMember: false,
  isDiscretionaryTarget: 0,
}
// promotionDemotionBand が未設定の jobLevel
const JL_M3: JobLevelEntry = {
  code: 'M3', label: 'M3',
  promotionDemotionBand: undefined,
  promotionDemotionWarningLevel: 2,
  isRegularEmployee: true, isSecondmentAcceptance: false,
  isExtendedEmployeePosition: false, isExtendedEmployeeJobClassification: false,
  isRegularEmployeeOrSecondmentAcceptance: true, isExtendedEmployeeUnionMember: false,
  isDiscretionaryTarget: 0,
}

const PG_M4_X: PayGradeEntry = { code: 'G4X', label: 'G4X', band: 'M4', compensationCategory: 'X', isRegularEmployee: true,  isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }
const PG_M4_Y: PayGradeEntry = { code: 'G4Y', label: 'G4Y', band: 'M4', compensationCategory: 'Y', isRegularEmployee: true,  isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }
const PG_M5_X: PayGradeEntry = { code: 'G5X', label: 'G5X', band: 'M5', compensationCategory: 'X', isRegularEmployee: true,  isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }
const PG_M5_Y: PayGradeEntry = { code: 'G5Y', label: 'G5Y', band: 'M5', compensationCategory: 'Y', isRegularEmployee: true,  isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }
// band 未設定の正社員 payGrade（フィルタを通過する）
const PG_NOBAND: PayGradeEntry = { code: 'GNB', label: 'GNB', band: undefined, compensationCategory: undefined, isRegularEmployee: true,  isSecondmentAcceptance: false, isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }
// 非正社員 payGrade（F2 条件下では除外される）
const PG_OUTSOURCE: PayGradeEntry = { code: 'OG3', label: 'OG3', band: undefined, compensationCategory: undefined, isRegularEmployee: false, isSecondmentAcceptance: true,  isExtendedEmployee: false, isConcurrent: false, isPayGradeChange: false }

const JT_SE_X: JobTypeEntry = { code: 'SE', label: 'SE', jobFamilyCode: 'JF1', isDiscretionaryTarget: false, compensationCategory: 'X' }
const JT_SE_Y: JobTypeEntry = { code: 'SE2', label: 'SE2', jobFamilyCode: 'JF1', isDiscretionaryTarget: false, compensationCategory: 'Y' }

const ALL_GRADES = [PG_M4_X, PG_M4_Y, PG_M5_X, PG_M5_Y, PG_NOBAND, PG_OUTSOURCE]

const baseCL = makeCL({
  jobLevels: [JL_M3, JL_M4, JL_M5],
  payGrades:  ALL_GRADES,
  jobTypes:   [JT_SE_X, JT_SE_Y],
  employmentTypes: Object.values(MOCK_EMP_TYPES),
})

// ── band=M4 の正社員行（F2 条件が適用される基準ケース）──────────────────────────
const ROW_M4_SE_X = makePersonRow({
  band: 'M4', jobType: 'SE',
  employmentType: '社員',
  userId: 'u1', groupEmployeeId: 'u1',
})

// ── テスト ──────────────────────────────────────────────────────────────────────

describe('payGrade フィルタ — F2 正社員ルール', () => {

  test('band=M4 / jobType=SE(X) → band=M4 かつ compensationCategory=X の payGrade のみ valid', () => {
    const { valid } = getGroupedFieldOptions('payGrade', ROW_M4_SE_X, baseCL)
    // G4X だけが通過（band=M4, cat=X）+ band未設定の GNB も通過（e.band が falsy のためフィルタスキップ）
    expect(valid).toContain('G4X')
    expect(valid).toContain('GNB')
    expect(valid).not.toContain('G4Y') // cat=Y なので除外
    expect(valid).not.toContain('G5X') // band=M5 なので除外
    expect(valid).not.toContain('OG3') // isRegularEmployee=false なので除外
  })

  test('band=M5 に変更 → M5 帯の payGrade に切り替わる', () => {
    const row = makePersonRow({
      band: 'M5', jobType: 'SE',
      employmentType: '社員',
      userId: 'u1', groupEmployeeId: 'u1',
    })
    const { valid } = getGroupedFieldOptions('payGrade', row, baseCL)
    expect(valid).toContain('G5X')
    expect(valid).not.toContain('G4X')
    expect(valid).not.toContain('G4Y')
    expect(valid).not.toContain('G5Y') // cat=Y なので除外
  })

  test('jobType=SE2(Y) に変更 → compensationCategory=Y の payGrade に切り替わる', () => {
    const row = makePersonRow({
      band: 'M4', jobType: 'SE2',
      employmentType: '社員',
      userId: 'u1', groupEmployeeId: 'u1',
    })
    const { valid } = getGroupedFieldOptions('payGrade', row, baseCL)
    expect(valid).toContain('G4Y')
    expect(valid).not.toContain('G4X')
    expect(valid).not.toContain('G5X')
  })

  test('promotionDemotionBand 未設定の jobLevel(M3) → band チェックなし、compensationCategory=X のみ絞り込み', () => {
    const row = makePersonRow({
      band: 'M3', jobType: 'SE',
      employmentType: '社員',
      userId: 'u1', groupEmployeeId: 'u1',
    })
    const { valid } = getGroupedFieldOptions('payGrade', row, baseCL)
    // band チェックはスキップ → M4/M5 関係なく isRegularEmployee=true & cat=X が通過
    expect(valid).toContain('G4X')
    expect(valid).toContain('G5X')
    expect(valid).not.toContain('G4Y')
    expect(valid).not.toContain('OG3')
  })

  test('非正社員 payGrade (OG3) は valid に含まれない', () => {
    const { valid } = getGroupedFieldOptions('payGrade', ROW_M4_SE_X, baseCL)
    expect(valid).not.toContain('OG3')
  })

  test('invalid には条件外だが baseOptions に存在する payGrade が入る', () => {
    const { invalid } = getGroupedFieldOptions('payGrade', ROW_M4_SE_X, baseCL)
    // G4Y, G5X, G5Y は isRegularEmployee=true だが cat or band で弾かれる → invalid
    expect(invalid).toContain('G4Y')
    expect(invalid).toContain('G5X')
    // OG3 は一般ルール（全 payGrade）の baseOptions に含まれる → invalid に入る
    expect(invalid).toContain('OG3')
  })
})

describe('payGrade フィルタ — F2 条件が外れるケース', () => {

  test('userId が未設定 → F2 条件 false → 一般ルール（全 payGrade）が valid', () => {
    // userId がないと当人は空席扱いで isRegularEmployee 判定が当たらない
    const row = makePersonRow({
      band: 'M4', jobType: 'SE',
      employmentType: '社員',
      userId: undefined, groupEmployeeId: undefined,
    })
    const result = getGroupedFieldOptions('payGrade', row, baseCL)
    // 条件付きルールがヒットしないので baseOptions 全件が valid
    expect(result.invalid).toHaveLength(0)
    expect(result.valid).toContain('G4X')
    expect(result.valid).toContain('OG3')
  })

  test('userId ≠ groupEmployeeId（出向受入）→ F2 条件 false → 一般ルールにフォールバック', () => {
    const row = makePersonRow({
      band: 'M4', jobType: 'SE',
      employmentType: '社員',
      userId: 'u1', groupEmployeeId: 'u2', // 別人 → 出向受入相当
    })
    const { valid, invalid } = getGroupedFieldOptions('payGrade', row, baseCL)
    expect(invalid).toHaveLength(0)
    expect(valid).toContain('OG3')
  })
})
