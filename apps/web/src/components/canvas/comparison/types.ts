import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'

export type PersonStatus = 'stayed' | 'moved-out' | 'moved-in'

export interface PersonComparisonEntry {
  row:            AllocationRow
  status:         PersonStatus
  /** moved-out: 転出先組織名 / moved-in: 転入元組織名 / stayed: '' */
  relatedOrgName: string
}

export interface OrgComparisonData {
  beforeOrg:  Organization
  afterOrg:   Organization | null
  /** externalCode が一致して自動対応付けされた場合 true */
  autoMapped: boolean
  persons:    PersonComparisonEntry[]
}
