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
}

export interface ExcelRow {
  rowId: string
  personId: string
  personName: string
  companyId: string
  companyName: string
  hasSF: boolean
  operationType: string
  effectiveDate: string
  beforeOrgName?: string
  beforeTitle?: string
  beforeBand?: string
  beforeManagerName?: string
  beforePositionId?: string
  afterOrgName?: string
  afterTitle?: string
  afterBand?: string
  afterManagerName?: string
  afterPositionId?: string
  sfPersonId?: string
  notes?: string
}
