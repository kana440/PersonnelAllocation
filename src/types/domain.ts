// Domain types are inferred from Zod schemas — schemas are the source of truth.
// Importing from here is safe for all components; the underlying type hasn't changed.
export type {
  BandOption,
  Company,
  Organization,
  Person,
  Position,
  AffiliationType,
  Affiliation,
  OperationKind,
  Operation,
} from '../domain/schemas'

// ── Excel申請書専用型 (Zod化の対象外: UI出力専用) ──────────────

export interface PositionSnapshot {
  employmentType?: string
  concurrentType: string
  concurrentReason?: string
  secondmentSourceCompany?: string
  secondmentSourceEmployeeId?: string
  isOnLeave?: boolean
  positionCode?: string
  orgCode?: string
  jobTitle?: string
  freeTitle?: string
  secondmentDestCompany?: string
  workLocation?: string
  costCenter?: string
  managerPositionCode?: string
  managerName?: string
  jobFamily?: string
  jobType?: string
  positionBand?: string
  individualBand?: string
  salaryGrade?: string
  isTrainingPosition?: boolean
  isNonUnionAgreement?: boolean
  isUnionPosition?: boolean
  isUnionMember?: boolean
  isDiscretionaryLaborPosition?: boolean
  isDiscretionaryLabor?: boolean
}

export interface ExcelRow {
  rowId: string
  personId: string
  personName: string
  companyId: string
  companyName: string
  hasSF: boolean
  effectiveDate: string
  operationType: string
  sfPersonId?: string
  lastName: string
  firstName: string
  transferReason?: string
  memo?: string
  promotionSign?: boolean
  demotionReason?: string
  salaryGradeChangeSign?: boolean
  after: PositionSnapshot | null
  before: PositionSnapshot | null
}
