import type { AllMasters } from './types'

// Port — swap implementations without touching business logic:
//   LocalStorageMasterRepository  (current: browser localStorage)
//   ApiMasterRepository             (future: REST API)
//   SalesforceMasterRepository      (future: SF picklist values)
export interface IMasterRepository {
  load(): Promise<AllMasters | null>
  save(lists: AllMasters): Promise<void>
  clear(): Promise<void>
  isSetupComplete(): boolean
}
