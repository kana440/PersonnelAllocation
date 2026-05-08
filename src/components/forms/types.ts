import type { Affiliation, Company, Organization, Person, Position, OperationKind } from '../../types/domain'

export interface AffDetail {
  aff: Affiliation
  pos: Position
  org: Organization
  company: Company
}

export interface FormSubmitPayload {
  kind: OperationKind
  label: string
  params: Record<string, string>
  transferReason?: string
  memo?: string
  promotionSign?: boolean
}

export interface BaseFormProps {
  person: Person
  primaryAft: AffDetail | undefined
  concurrentAft: AffDetail[]
  afterDetails: AffDetail[]
  activeCompanyIds: string[]
  companies: Company[]
  afterOrganizations: Organization[]
  onSubmit: (payload: FormSubmitPayload) => void
  onCancel: () => void
}
