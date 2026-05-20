import type { AllocationList } from '../csvImport/allocationList/schema'

// ── 操作種別 ──────────────────────────────────────────────────────
// DirectEdit: Excel行のafterフィールドを直接編集した変更
// 将来: ConstrainedEdit（特定フィールド限定）、CompoundOperation（複数行一括）
export const OPERATION_KINDS = ['DirectEdit'] as const
export type OperationKind = (typeof OPERATION_KINDS)[number]

// DirectEdit が保持する after 列の変更値
export type AfterValues = Partial<
  Pick<
    AllocationList,
    | 'employmentType' | 'concurrentType' | 'concurrentReason'
    | 'secondmentFromCompany' | 'secondmentFromEmployeeNumber'
    | 'leaveFlag' | 'positionCode' | 'departmentCode'
    | 'businessUnit' | 'division' | 'subDivision' | 'group' | 'team'
    | 'officialPositionCode' | 'localJobTitle' | 'secondmentToCompany'
    | 'location' | 'costCenter' | 'managerPositionCode' | 'managerName'
    | 'jobFamily' | 'jobType' | 'positionBand' | 'band' | 'payGrade'
    | 'trainingPositionFlag' | 'nonUnionAgreementFlag' | 'positionUnionFlag'
    | 'unionFlag' | 'positionDiscretionaryWorkFlag' | 'discretionaryWorkFlag'
    | 'transferReason' | 'memo' | 'promotionSign' | 'demotionReason' | 'payGradeChangeSign'
  >
>

// 後方互換エイリアス（旧 OperationGroup 参照箇所が段階的に移行できるよう残す）
export type OperationGroupKind = OperationKind
export interface OperationGroup {
  id:            string
  kind:          OperationKind
  label:         string
  rowIds:        number[]
  order:         number
  effectiveDate: string
  params:        Record<string, string>
  afterValues?:  AfterValues
}
