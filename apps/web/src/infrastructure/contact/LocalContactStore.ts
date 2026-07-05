import type { ContactRecord } from '../../ports/contactTypes'
import type { ContactStorePort } from '../../ports/ContactStorePort'

const FILE_NAME = 'personnel-contacts.json'
const SCHEMA_VERSION = 1

interface StoredContacts {
  schemaVersion: number
  records: ContactRecord[]
  lastSyncedAt: string | null
}

export class LocalContactStore implements ContactStorePort {
  private cache: ContactRecord[] | null = null

  private isAvailable(): boolean {
    return typeof navigator !== 'undefined'
      && 'storage' in navigator
      && typeof navigator.storage.getDirectory === 'function'
  }

  async load(): Promise<ContactRecord[]> {
    if (this.cache) return this.cache
    if (!this.isAvailable()) return []
    try {
      const root   = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle(FILE_NAME).catch(() => null)
      if (!handle) return []
      const file   = await handle.getFile()
      const text   = await file.text()
      const stored = JSON.parse(text) as StoredContacts
      this.cache = stored.records ?? []
      return this.cache
    } catch { return [] }
  }

  async upsert(record: ContactRecord): Promise<void> {
    const records = await this.load()
    const idx = records.findIndex(r => r.id === record.id)
    if (idx >= 0) records[idx] = record
    else records.push(record)
    this.cache = records
    await this.persist(records)
  }

  async upsertMany(incoming: ContactRecord[]): Promise<void> {
    const records = await this.load()
    const byId = new Map(records.map(r => [r.id, r]))
    for (const r of incoming) byId.set(r.id, r)
    this.cache = [...byId.values()]
    await this.persist(this.cache)
  }

  async getLastSyncedAt(): Promise<string | null> {
    if (!this.isAvailable()) return null
    try {
      const root   = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle(FILE_NAME).catch(() => null)
      if (!handle) return null
      const file   = await handle.getFile()
      const text   = await file.text()
      return (JSON.parse(text) as StoredContacts).lastSyncedAt
    } catch { return null }
  }

  async markSynced(): Promise<void> {
    const records = await this.load()
    await this.persist(records, new Date().toISOString())
  }

  private async persist(records: ContactRecord[], lastSyncedAt?: string): Promise<void> {
    if (!this.isAvailable()) return
    const stored: StoredContacts = {
      schemaVersion: SCHEMA_VERSION,
      records,
      lastSyncedAt:  lastSyncedAt ?? (await this.getLastSyncedAt()),
    }
    const root     = await navigator.storage.getDirectory()
    const handle   = await root.getFileHandle(FILE_NAME, { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(stored))
    await writable.close()
  }
}
