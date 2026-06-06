import type { AllCodeLists } from './types'

// Port — swap implementations without touching business logic:
//   LocalStorageCodeListRepository  (current: browser localStorage)
//   ApiCodeListRepository           (future: REST API)
//   SalesforceCodeListRepository    (future: SF picklist values)
export interface ICodeListRepository {
  load(): Promise<AllCodeLists | null>
  save(lists: AllCodeLists): Promise<void>
  clear(): Promise<void>
  isSetupComplete(): boolean
}
