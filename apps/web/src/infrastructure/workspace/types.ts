import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { UserSession } from '../../application/userSession'

export const SCHEMA_VERSION = 1

export interface PersistedPayload {
  schemaVersion:       number
  savedAt:             string
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  masters:             AllMasters
  effectiveDate:       string
  userSession:         UserSession
}

export interface WorkspaceMeta {
  id:            string
  savedAt:       string
  effectiveDate: string
  rowCount:      number
  assigneeName:  string | null
  role:          'admin' | 'assignee'
}
