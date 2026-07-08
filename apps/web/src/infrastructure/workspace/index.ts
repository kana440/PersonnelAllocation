import { LocalWorkspaceStore } from './LocalWorkspaceStore'
import { SCHEMA_VERSION } from './types'
import type { PersistedPayload, WorkspaceMeta, MergeSession, MergeHistoryEntry } from './types'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { UserSession } from '../../application/userSession'

export type { PersistedPayload, WorkspaceMeta, MergeSession, MergeSessionRow, MergeHistoryEntry, MergeHistoryRowSummary } from './types'
export type { WorkspaceStore } from './WorkspaceStore'
export { SCHEMA_VERSION } from './types'

export const workspaceStore = new LocalWorkspaceStore()

interface SnapshotSlice {
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  masters:             AllMasters
}

export function buildPersistedPayload(
  snapshot:    SnapshotSlice,
  effectiveDate: string,
  userSession:   UserSession,
  fileName:      string | null,
  pendingMerge:  MergeSession | null,
  mergeHistory:  MergeHistoryEntry[] = [],
): PersistedPayload {
  return {
    schemaVersion:       SCHEMA_VERSION,
    savedAt:             new Date().toISOString(),
    allocationList:      snapshot.allocationList,
    beforeOrganizations: snapshot.beforeOrganizations,
    afterOrganizations:  snapshot.afterOrganizations,
    masters:             snapshot.masters,
    effectiveDate,
    userSession,
    fileName,
    pendingMerge,
    mergeHistory,
  }
}

export function buildWorkspaceMeta(payload: PersistedPayload): WorkspaceMeta {
  return {
    id:            'autosave',
    savedAt:       payload.savedAt,
    effectiveDate: payload.effectiveDate,
    rowCount:      payload.allocationList.length,
    assigneeName:  payload.userSession.assigneeName,
    role:          payload.userSession.role,
    fileName:      payload.fileName,
  }
}
