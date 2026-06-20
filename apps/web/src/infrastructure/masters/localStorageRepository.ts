import type { IMasterRepository } from './repository'
import type { AllMasters } from './types'

const LISTS_KEY = 'pa:code-lists'
const SETUP_KEY = 'pa:setup-complete'

export class LocalStorageMasterRepository implements IMasterRepository {
  async load(): Promise<AllMasters | null> {
    const raw = localStorage.getItem(LISTS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AllMasters
    } catch {
      return null
    }
  }

  async save(lists: AllMasters): Promise<void> {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists))
    localStorage.setItem(SETUP_KEY, 'true')
  }

  async clear(): Promise<void> {
    localStorage.removeItem(LISTS_KEY)
    localStorage.removeItem(SETUP_KEY)
  }

  isSetupComplete(): boolean {
    return localStorage.getItem(SETUP_KEY) === 'true'
  }
}
