import { create } from 'zustand/react'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import { EMPTY_MASTERS } from '@personnel/domain/masters/aggregate'
import { LocalStorageMasterRepository } from '../infrastructure/masters/localStorageRepository'

// Write path: only the setup flow needs to write code lists.
// The read path goes through HRApplicationService.initialize() → DomainSnapshot → useStore().masters.
const repo = new LocalStorageMasterRepository()

interface MasterState {
  isChecked:   boolean   // true once localStorage has been read
  isSetupDone: boolean   // true once the user has completed setup

  checkStorage: () => void
  save:         (lists: AllMasters) => Promise<void>
  skipSetup:    () => Promise<void>
  resetSetup:   () => Promise<void>
}

export const useMasterStore = create<MasterState>()((set) => ({
  isChecked:   false,
  isSetupDone: false,

  // Only checks the setup flag — actual list data is loaded by HRApplicationService
  checkStorage: () => {
    set({ isChecked: true, isSetupDone: repo.isSetupComplete() })
  },

  save: async (lists) => {
    await repo.save(lists)
    set({ isSetupDone: true })
  },

  skipSetup: async () => {
    await repo.save(EMPTY_MASTERS)
    set({ isSetupDone: true })
  },

  resetSetup: async () => {
    await repo.clear()
    set({ isSetupDone: false, isChecked: false })
  },
}))
