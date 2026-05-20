import type { AllCodeLists }   from '../domain/codeLists/aggregate'
import type { AllocationRow }  from '../domain/allocationRow'
import type { Organization, Company } from '../domain/schemas'

// ── Data source port (read) ──────────────────────────────────────────────────
// Excel implementation: src/infrastructure/excelImport.ts (importFromFile)
// Future SF implementation: src/adapters/salesforce/SFDataSource.ts

export interface AllocationData {
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  companies:           Company[]
  codeLists:           AllCodeLists
}

export interface IAllocationDataSource {
  load(): Promise<AllocationData>
}

// ── Data export port (write) ─────────────────────────────────────────────────
// Excel implementation: src/utils/excelIO.ts (exportToXlsx)
// Future SF implementation: src/adapters/salesforce/SFExporter.ts

export interface IAllocationExporter {
  export(data: AllocationData): Promise<void>
}

// ── Code list port ───────────────────────────────────────────────────────────
// Implementation: src/infrastructure/codeLists/localStorageRepository.ts
// Future SF implementation: SFPicklistRepository

export interface ICodeListSource {
  load(): Promise<AllCodeLists | null>
}
