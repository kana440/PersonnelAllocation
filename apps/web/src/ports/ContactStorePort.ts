import type { ContactRecord } from './contactTypes'

export interface ContactStorePort {
  load(): Promise<ContactRecord[]>
  upsert(record: ContactRecord): Promise<void>
  upsertMany(records: ContactRecord[]): Promise<void>
}
