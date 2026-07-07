import { EMPTY_MASTERS } from '@personnel/domain/masters/aggregate'
import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useStore } from '../../store/useStore'
import type { SyntheticOrg, SyntheticRow } from './syntheticData'

/**
 * 合成データを「本物の appService / useStore」に直接流し込む（Excelインポートは経由しない）。
 * これにより、本物のコンポーネント（RowCard・useOrgViewData・usePersonSelection 等）を
 * データの出所を気にせず実行できる。persons は appService 側で allocationList から
 * 自動導出される（derivePersons）ため別途注入不要。
 */
export async function loadSyntheticIntoStore(orgs: SyntheticOrg[], rows: SyntheticRow[]): Promise<void> {
  const afterOrganizations: Organization[] = orgs.map(o => ({
    id:           o.id,
    name:         o.name,
    companyId:    'synthetic',
    parentId:     o.parentId,
    level:        1,
    externalCode: o.id,
  }))

  const allocationList: AllocationRow[] = rows.map(r => ({
    rowId:                  r.rowId,
    userId:                 r.userId,
    lastName:               r.lastName,
    firstName:              r.firstName,
    departmentCode:         r.departmentCode,
    positionCode:           r.positionCode,
    promotionSign:          undefined,
    payGradeChangeSign:     undefined,
    leaveOfAbsenceSign:     undefined,
    prevLeaveOfAbsenceSign: undefined,
  }))

  await useStore.getState().loadExcelData({
    allocationList,
    beforeOrganizations:         afterOrganizations, // Phase 1: 比較機能は使わないため before=after で代用
    afterOrganizations,
    masters:                     EMPTY_MASTERS,
    sheetsFound:                 ['synthetic'],
    sheetsMissing:               [],
    orgEntries:                  [],
    oldOrgEntries:                [],
    allocationRowCount:           allocationList.length,
    masterCompatibilityWarnings: [],
    columnWarnings:              [],
  })
}
