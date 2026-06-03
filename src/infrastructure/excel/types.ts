import type { AllCodeLists }  from '../../domain/masters/aggregate'
import type { Organization }  from '../../domain/schemas'
import type { AllocationRow } from '../../domain/allocationRow'
import type { OrgMasterEntry } from '../../domain/masters/orgMaster'
import type { CompatibilityWarning } from '../codeLists/parser'

export interface ImportedWorkbookResult {
  codeLists:                    AllCodeLists
  beforeOrganizations:          Organization[]
  afterOrganizations:           Organization[]
  allocationList:               AllocationRow[]
  sheetsFound:                  string[]
  sheetsMissing:                string[]
  orgEntries:                   OrgMasterEntry[]
  allocationRowCount:           number
  codeListCompatibilityWarnings: CompatibilityWarning[]
}

export type ProgressCallback = (message: string) => void

export const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))
