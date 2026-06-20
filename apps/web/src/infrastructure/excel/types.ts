import type { AllCodeLists }  from '@personnel/domain/masters/aggregate'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import type { CompatibilityWarning } from '../codeLists/parser'

export interface ColumnWarning {
  sheet:   string
  message: string
}

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
  columnWarnings:               ColumnWarning[]
}

export type ProgressCallback = (message: string) => void

export const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))
