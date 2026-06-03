import { create } from 'zustand'
import type { AllCodeLists } from '../domain/masters/aggregate'
import { EMPTY_CODE_LISTS } from '../domain/masters/aggregate'
import { LocalStorageCodeListRepository } from '../infrastructure/codeLists/localStorageRepository'

// Write path: only the setup flow needs to write code lists.
// The read path goes through HRApplicationService.initialize() → DomainSnapshot → useStore().codeLists.
const repo = new LocalStorageCodeListRepository()

interface CodeListState {
  isChecked:   boolean   // true once localStorage has been read
  isSetupDone: boolean   // true once the user has completed setup

  checkStorage: () => void
  save:         (lists: AllCodeLists) => Promise<void>
  skipSetup:    () => Promise<void>
  resetSetup:   () => Promise<void>
}

export const useCodeListStore = create<CodeListState>((set) => ({
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
    await repo.save(EMPTY_CODE_LISTS)
    set({ isSetupDone: true })
  },

  resetSetup: async () => {
    await repo.clear()
    set({ isSetupDone: false, isChecked: false })
  },
}))
