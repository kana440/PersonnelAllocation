import type { Repositories } from '../ports'
import type { BaseStateFromImport } from '../utils/excelIO'
import type { AllCodeLists } from '../domain/codeLists/aggregate'
import {
  MockMasterRepository,
  MockCompanyRepository,
  MockOrganizationRepository,
  MockPersonRepository,
  MockPositionRepository,
  MockAffiliationRepository,
  MockOperationRepository,
} from '../adapters/mock'
import { LocalStorageCodeListRepository } from './codeLists/localStorageRepository'

// ── ファクトリ関数 ─────────────────────────────────────────────
// ここを切り替えるだけで Mock → Excel → Salesforce と差し替え可能。
// 将来:
//   createExcelContainer(workbook)  — アップロードされたExcelから生成
//   createSalesforceContainer(auth) — SF接続情報から生成

export function createMockContainer(): Repositories {
  return {
    masters:       new MockMasterRepository(),
    companies:     new MockCompanyRepository(),
    organizations: new MockOrganizationRepository(),
    persons:       new MockPersonRepository(),
    positions:     new MockPositionRepository(),
    affiliations:  new MockAffiliationRepository(),
    operations:    new MockOperationRepository(),
    codeLists:     new LocalStorageCodeListRepository(),
  }
}

// Empty container for fresh-start sessions (user imports data via UI)
export function createEmptyContainer(): Repositories {
  return {
    masters:       { getBands: async () => [], getTransferReasons: async () => [], getPositionTitles: async () => [] },
    companies:     { getAll: async () => [] },
    organizations: { getAll: async () => [], getByCompany: async () => [] },
    persons:       { getAll: async () => [], getById: async () => null },
    positions:     { getAll: async () => [] },
    affiliations:  { getAll: async () => [] },
    operations:    { getAll: async () => [], save: async () => {}, delete: async () => {} },
    codeLists:     new LocalStorageCodeListRepository(),
  }
}

// Container built from imported Excel data (要員配置リスト + 各種TBL)
export function createImportedContainer(
  base: BaseStateFromImport,
  codeLists: AllCodeLists,
): Repositories {
  return {
    masters:       { getBands: async () => [], getTransferReasons: async () => [], getPositionTitles: async () => [] },
    companies:     { getAll: async () => base.companies },
    organizations: {
      getAll:       async ()     => base.organizations,
      getByCompany: async (id)   => base.organizations.filter(o => o.companyId === id),
    },
    persons:       {
      getAll:   async ()   => base.persons,
      getById:  async (id) => base.persons.find(p => p.id === id) ?? null,
    },
    positions:     { getAll: async () => base.positions },
    affiliations:  { getAll: async () => base.affiliations },
    operations:    { getAll: async () => [], save: async () => {}, delete: async () => {} },
    codeLists:     { load: async () => codeLists },
  }
}
