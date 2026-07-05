import type { PersistedPayload, WorkspaceMeta } from './types'

export interface WorkspaceStore {
  isAvailable(): boolean
  save(meta: WorkspaceMeta, payload: PersistedPayload): Promise<void>
  list(): Promise<WorkspaceMeta[]>
  load(id: string): Promise<PersistedPayload | null>
  delete(id: string): Promise<void>
}
