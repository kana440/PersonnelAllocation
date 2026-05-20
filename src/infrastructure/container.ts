// container.ts: 開発用モックコンテナのみ残す
// Excel インポートパスは HRApplicationService.loadExcelData() を直接呼ぶため不要

import type { Repositories } from '../ports'
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
