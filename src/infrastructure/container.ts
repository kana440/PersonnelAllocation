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
  }
}
