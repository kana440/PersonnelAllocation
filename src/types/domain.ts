export interface Company {
  id: string
  name: string
  hasSF: boolean
}

export interface Organization {
  id: string
  name: string
  companyId: string
  parentId: string | null
  level: number
}

export interface Person {
  id: string
  name: string
  sfPersonId?: string
}

export interface Position {
  id: string
  orgId: string
  companyId: string
  title?: string
  band?: string
  isVacant: boolean
  sfPositionId?: string
  // SF Position Management fields
  workLocation?: string
  costCenter?: string
  jobFamily?: string
  jobType?: string
  isTrainingPosition?: boolean
  isUnionPosition?: boolean
  isDiscretionaryLaborPosition?: boolean
}

export type AffiliationType = 'primary' | 'concurrent'

export interface Affiliation {
  id: string
  personId: string
  positionId: string
  type: AffiliationType
  managerId?: string
  status: 'active' | 'ended'
  startDate: string
  endDate?: string
  // SF Job Information fields (individual values, can override position defaults)
  employmentType?: string          // 雇用タイプ: 正社員/出向/契約社員 etc.
  concurrentReason?: string        // 兼務理由
  secondmentSourceCompanyId?: string  // 出向元会社
  secondmentSourceEmployeeId?: string // 出向元会社社員番号
  isOnLeave?: boolean              // 休職者サイン
  individualBand?: string          // バンド (position bandの個人上書き)
  salaryGrade?: string             // 給与等級
  freeTitle?: string               // フリータイトル (position titleの個人上書き)
  isNonUnionAgreement?: boolean    // 非組合協定対象者フラグ
  isUnionMember?: boolean          // 労働組合員
  isDiscretionaryLabor?: boolean   // 裁量労働対象フラグ (個人)
}

export type OperationKind =
  | 'MoveToOrg'
  | 'AddConcurrent'
  | 'RemoveConcurrent'
  | 'SetManager'
  | 'Promote'
  | 'SendOnSecondment'
  | 'RecallFromSecondment'
  | 'ChangeSecondment'
  | 'Hire'
  | 'Retire'
  | 'CreateVacantPosition'
  | 'FillVacantPosition'

export interface Operation {
  id: string
  kind: OperationKind
  label: string
  params: Record<string, string>
  effectiveDate: string
  order: number
  // Excel申請書メタ情報
  transferReason?: string   // 申請区分（異動事由）
  memo?: string             // メモ
  promotionSign?: boolean   // 昇降格サイン
  demotionReason?: string   // 降格理由
  salaryGradeChangeSign?: boolean // 給与等級変更サイン
}

// ────────────────────────────────────────────────────────────
// Excel申請書 型定義
// Column order: 本人情報 | 変更区分 | After | Before
// ────────────────────────────────────────────────────────────

export interface PositionSnapshot {
  // ── 個人設定フィールド (Affiliation から)
  employmentType?: string          // 雇用タイプ
  concurrentType: string           // 本務兼務区分: '本務' | '兼務'
  concurrentReason?: string        // 兼務理由
  secondmentSourceCompany?: string // 出向元会社
  secondmentSourceEmployeeId?: string // 出向元会社社員番号
  isOnLeave?: boolean              // 休職者サイン
  // ── ポジションフィールド (Position から)
  positionCode?: string            // ポジションコード
  orgCode?: string                 // 組織コード
  jobTitle?: string                // 役職 (Position.title)
  freeTitle?: string               // フリータイトル (個人上書き)
  secondmentDestCompany?: string   // 出向先会社
  workLocation?: string            // 勤務場所
  costCenter?: string              // コストセンター
  managerPositionCode?: string     // 上司ポジションコード
  managerName?: string             // 上司氏名
  jobFamily?: string               // ジョブファミリー
  jobType?: string                 // ジョブタイプ
  positionBand?: string            // ポジションのバンド
  individualBand?: string          // バンド (個人上書き)
  salaryGrade?: string             // 給与等級
  isTrainingPosition?: boolean     // 業務研修ポジションフラグ
  isNonUnionAgreement?: boolean    // 非組合協定対象者フラグ
  isUnionPosition?: boolean        // ポジションの労働組合員フラグ
  isUnionMember?: boolean          // 労働組合員
  isDiscretionaryLaborPosition?: boolean // ポジションの裁量労働対象フラグ
  isDiscretionaryLabor?: boolean   // 裁量労働対象フラグ (個人)
}

export interface ExcelRow {
  // メタ (表示用)
  rowId: string
  personId: string
  personName: string
  companyId: string
  companyName: string
  hasSF: boolean
  effectiveDate: string
  operationType: string
  // ── 本人情報
  sfPersonId?: string
  lastName: string
  firstName: string
  // ── 変更区分
  transferReason?: string
  memo?: string
  promotionSign?: boolean
  demotionReason?: string
  salaryGradeChangeSign?: boolean
  // ── After / Before
  after: PositionSnapshot | null
  before: PositionSnapshot | null
}
