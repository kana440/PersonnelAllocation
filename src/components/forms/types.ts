import type { Affiliation, BandOption, Company, Organization, Person, Position, OperationKind } from '../../domain/schemas'

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
  // エンティティ
  person: Person
  primaryAft: AffDetail | undefined
  concurrentAft: AffDetail[]
  afterDetails: AffDetail[]
  activeCompanyIds: string[]
  companies: Company[]
  afterOrganizations: Organization[]
  // マスタ（リポジトリから取得）
  bands: BandOption[]
  transferReasons: string[]
  // コールバック
  onSubmit: (payload: FormSubmitPayload) => void
  onCancel: () => void
}
