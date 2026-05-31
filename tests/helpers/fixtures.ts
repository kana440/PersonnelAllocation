import type { AllocationRow }  from '../../src/domain/allocationRow'
import type { AllCodeLists }   from '../../src/domain/codeLists/aggregate'
import type { Organization }   from '../../src/domain/schemas'
import { EMPTY_CODE_LISTS }    from '../../src/domain/codeLists/aggregate'

// ── 最小有効行 ─────────────────────────────────────────────────────────────────
// transferReason のみ設定。各テストが必要なフィールドを override する。
const BASE_ROW: Partial<AllocationRow> = {
  transferReason: '通常異動',
}

export const makeRow = (overrides: Partial<AllocationRow> = {}): AllocationRow =>
  ({ ...BASE_ROW, ...overrides } as AllocationRow)

// よく使うポジション付き行（A1-1 必須フィールド一式）
export const makePosRow = (overrides: Partial<AllocationRow> = {}): AllocationRow =>
  makeRow({
    positionCode:                 'P12345678',
    departmentCode:               'ORG001',
    officialPositionCode:         '一般職',
    location:                     '本社',
    costCenter:                   '12345-AB00001',
    managerPositionCode:          'P00000001',
    jobFamily:                    'エンジニアリング',
    jobType:                      'SE',
    positionBand:                 'M4',
    trainingPositionFlag:         '0',
    positionUnionFlag:            '非組合員',
    positionDiscretionaryWorkFlag:'0',
    ...overrides,
  })

// よく使う在席行（A1-2 必須フィールド一式）
export const makePersonRow = (overrides: Partial<AllocationRow> = {}): AllocationRow =>
  makePosRow({
    userId:               '1234567',
    groupEmployeeId:      '1234567',
    lastName:             '山田',
    firstName:            '太郎',
    employmentType:       '社員',
    concurrentType:       '本務',
    band:                 'M4',
    payGrade:             'G4',
    unionFlag:            '非組合員',
    discretionaryWorkFlag:'0',
    ...overrides,
  })

// ── コードリスト ───────────────────────────────────────────────────────────────
// 実際の Excel データを模倣した最小限のモック。
// テストは必要なエントリを override して使う。

export const MOCK_EMP_TYPES = {
  employee:  { code: 'EMP', label: '社員',       isEmployee: true,  isOutsourceAcceptance: false, isConcurrentOutsourceAcceptance: false, isEmploymentExtension: false },
  outsource: { code: 'OUT', label: '出向受入社員', isEmployee: false, isOutsourceAcceptance: true,  isConcurrentOutsourceAcceptance: false, isEmploymentExtension: false },
  extension: { code: 'EXT', label: '雇用延長社員', isEmployee: false, isOutsourceAcceptance: false, isConcurrentOutsourceAcceptance: false, isEmploymentExtension: true  },
  other:     { code: 'OTH', label: 'その他',       isEmployee: false, isOutsourceAcceptance: false, isConcurrentOutsourceAcceptance: false, isEmploymentExtension: false },
}

export const MOCK_JOB_LEVELS = {
  empM3:  { code: 'M3', label: 'M3', promotionDemotionWarningLevel: 2, promotionDemotionBand: undefined, isEmployee: true,  isOutsourceAcceptance: false, isEmploymentExtensionPosition: false, isEmploymentExtensionJobClassification: false, isEmployeeOrAcceptedUnionMember: true,  isEmploymentExtensionUnionMember: false, isDiscretionaryTarget: 0, isOutsourceAcceptance2: false },
  empM4:  { code: 'M4', label: 'M4', promotionDemotionWarningLevel: 3, promotionDemotionBand: undefined, isEmployee: true,  isOutsourceAcceptance: false, isEmploymentExtensionPosition: false, isEmploymentExtensionJobClassification: false, isEmployeeOrAcceptedUnionMember: true,  isEmploymentExtensionUnionMember: false, isDiscretionaryTarget: 0, isOutsourceAcceptance2: false },
  empM6:  { code: 'M6', label: 'M6', promotionDemotionWarningLevel: 5, promotionDemotionBand: undefined, isEmployee: true,  isOutsourceAcceptance: false, isEmploymentExtensionPosition: false, isEmploymentExtensionJobClassification: false, isEmployeeOrAcceptedUnionMember: true,  isEmploymentExtensionUnionMember: false, isDiscretionaryTarget: 0, isOutsourceAcceptance2: false },
  outM3:  { code: 'OM3', label: 'OM3', promotionDemotionWarningLevel: 0, promotionDemotionBand: undefined, isEmployee: false, isOutsourceAcceptance: true, isEmploymentExtensionPosition: false, isEmploymentExtensionJobClassification: false, isEmployeeOrAcceptedUnionMember: true, isEmploymentExtensionUnionMember: false, isDiscretionaryTarget: 0, isOutsourceAcceptance2: true },
  extE1:  { code: 'E1', label: 'E1', promotionDemotionWarningLevel: 0, promotionDemotionBand: undefined, isEmployee: false, isOutsourceAcceptance: false, isEmploymentExtensionPosition: true, isEmploymentExtensionJobClassification: true, isEmployeeOrAcceptedUnionMember: false, isEmploymentExtensionUnionMember: false, isDiscretionaryTarget: 0, isOutsourceAcceptance2: false },
}

export const MOCK_PAY_GRADES = {
  empG3:  { code: 'G3', label: 'G3', isEmployee: true,  isOutsourceAcceptance: false, isEmploymentExtension: false, isConcurrent: false, isPayGradeChangeSign: false },
  empG4:  { code: 'G4', label: 'G4', isEmployee: true,  isOutsourceAcceptance: false, isEmploymentExtension: false, isConcurrent: false, isPayGradeChangeSign: false },
  outOG3: { code: 'OG3', label: 'OG3', isEmployee: false, isOutsourceAcceptance: true, isEmploymentExtension: false,  isConcurrent: false, isPayGradeChangeSign: false },
  extEG1: { code: 'EG1', label: 'EG1', isEmployee: false, isOutsourceAcceptance: false, isEmploymentExtension: true, isConcurrent: false, isPayGradeChangeSign: false },
  conCG1: { code: 'CG1', label: 'CG1', isEmployee: false, isOutsourceAcceptance: false, isEmploymentExtension: false, isConcurrent: true,  isPayGradeChangeSign: false },
}

export const MOCK_TRANSFER_REASONS = {
  normal:       { code: 'TR', label: '通常異動',   noCheckRequired: false, concurrentCheckSign: false },
  noCheck:      { code: 'NC', label: 'チェック不要', noCheckRequired: true,  concurrentCheckSign: false },
  concurrent:   { code: 'CC', label: '兼務',        noCheckRequired: false, concurrentCheckSign: true  },
}

export const MOCK_OFFICIAL_POSITIONS = {
  normal:    { code: 'OP1', label: '一般職',         isFreeTitle: false, isDiscretionaryTarget: false },
  freeTitle: { code: 'OP2', label: 'フリータイトル役職', isFreeTitle: true,  isDiscretionaryTarget: false },
}

export const MOCK_ORG_ENTRIES = {
  normal:     { code: 'ORG001', companyCode: 'C1', name: '開発部',   phase: 'after' as const, company: 'テスト社', businessUnit: 'BU1', division: 'DIV1', department: 'DEPT1', group: 'G1', team: 'T1', organizationLevel: '通常組織', CostCenter: '12345-AB00001', workLocation: '本社' },
  secondment: { code: 'ORG002', companyCode: 'C1', name: '出向者部門', phase: 'after' as const, company: 'テスト社', businessUnit: 'BU1', division: 'DIV1', department: 'DEPT1', group: 'G1', team: 'T1', organizationLevel: '出向者用組織', CostCenter: '12345-AB00001', workLocation: '本社' },
}

// デフォルトのコードリストモック（テスト可能な最小セット）
export const MOCK_CODE_LISTS: AllCodeLists = {
  ...EMPTY_CODE_LISTS,
  employmentTypes:   Object.values(MOCK_EMP_TYPES),
  jobLevels:         Object.values(MOCK_JOB_LEVELS),
  payGrades:         Object.values(MOCK_PAY_GRADES),
  transferReasons:   Object.values(MOCK_TRANSFER_REASONS),
  officialPositions: Object.values(MOCK_OFFICIAL_POSITIONS),
  orgMasterEntries:  Object.values(MOCK_ORG_ENTRIES),
  workLocations:     [{ code: 'WL1', label: '本社' }],
  jobFamilies:       [{ code: 'JF1', label: 'エンジニアリング' }],
  subJobFamilies:    [{ code: 'SJF1', label: 'SE', jobFamilyCode: 'JF1', isDiscretionaryTarget: false, compensationCategory: '' }],
  concurrentReasons: [{ code: 'CR1', label: '業務支援' }],
}

// 部分的な override でマージ
export const makeCL = (overrides: Partial<AllCodeLists> = {}): AllCodeLists =>
  ({ ...MOCK_CODE_LISTS, ...overrides })

// Organization モック
export const MOCK_ORGS: Organization[] = [
  { id: 'org-001', externalCode: 'ORG001', name: '開発部', parentId: null, isAbandoned: false },
]
