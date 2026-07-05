import type { PersistedPayload, WorkspaceMeta } from './types'
import type { WorkspaceStore } from './WorkspaceStore'

const FILE_NAME = 'personnel-ws-autosave.json'

interface StoredEntry {
  meta:    WorkspaceMeta
  payload: PersistedPayload
}

export class LocalWorkspaceStore implements WorkspaceStore {
  isAvailable(): boolean {
    return typeof navigator !== 'undefined'
      && 'storage' in navigator
      && typeof navigator.storage.getDirectory === 'function'
  }

  async save(meta: WorkspaceMeta, payload: PersistedPayload): Promise<void> {
    const root     = await navigator.storage.getDirectory()
    const handle   = await root.getFileHandle(FILE_NAME, { create: true })
    const writable = await handle.createWritable()
    const entry: StoredEntry = { meta, payload }
    await writable.write(JSON.stringify(entry))
    await writable.close()
  }

  async list(): Promise<WorkspaceMeta[]> {
    if (!this.isAvailable()) return []
    try {
      const root   = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle(FILE_NAME).catch(() => null)
      if (!handle) return []
      const file   = await handle.getFile()
      const text   = await file.text()
      const entry  = JSON.parse(text) as StoredEntry
      return [entry.meta]
    } catch {
      return []
    }
  }

  async load(_id: string): Promise<PersistedPayload | null> {
    if (!this.isAvailable()) return null
    try {
      const root   = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle(FILE_NAME).catch(() => null)
      if (!handle) return null
      const file   = await handle.getFile()
      const text   = await file.text()
      const entry  = JSON.parse(text) as StoredEntry
      return entry.payload
    } catch {
      return null
    }
  }

  async delete(_id: string): Promise<void> {
    if (!this.isAvailable()) return
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(FILE_NAME).catch(() => {})
    } catch {
      // ignore
    }
  }
}
