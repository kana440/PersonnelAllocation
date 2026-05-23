import { delay } from './delay'
import { buildExportBuffer } from '../../excel/engine'
import { toAllocationRows } from '../../allocationListMapper'
import type { Organization } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { PersonDiff } from '../../../application/aiTypes'

export function buildExportChangeSummary(
  allRows: AllocationRow[],
  allOrgs: Organization[],
): { changeCount: number; groups: Array<{ orgName: string; persons: PersonDiff[] }> } {
  const changedRows = allRows.filter(r => r.operationGroupId)

  const byOrg = new Map<string, PersonDiff[]>()
  for (const row of changedRows) {
    const orgCode = row.departmentCode ?? row.prevDepartmentCode
    const orgName = allOrgs.find(o => (o.externalCode ?? o.id) === orgCode)?.name ?? orgCode ?? '不明'
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId || ''

    const diff: PersonDiff = {
      userId:  row.userId ?? '',
      name,
      orgName,
      rowId:   row.rowId,
      before: {
        grade:    row.prevPayGrade,
        position: row.prevOfficialPositionCode,
        orgName:  allOrgs.find(o => (o.externalCode ?? o.id) === row.prevDepartmentCode)?.name,
      },
      after: {
        grade:    row.payGrade,
        position: row.officialPositionCode,
        orgName:  allOrgs.find(o => (o.externalCode ?? o.id) === row.departmentCode)?.name,
        note:     (row.promotionSign ?? undefined) ? row.promotionSign : undefined,
      },
    }
    const group = byOrg.get(orgName) ?? []
    group.push(diff)
    byOrg.set(orgName, group)
  }

  const groups = Array.from(byOrg.entries()).map(([orgName, persons]) => ({ orgName, persons }))
  return { changeCount: changedRows.length, groups }
}

export const exportExcelScenario = {
  async confirmMessage(): Promise<string> {
    await delay(700)
    return '変更内容を確認しました。出力内容を確認してください。'
  },

  async buildBuffer(
    allocationList: AllocationRow[],
    beforeOrgs: Organization[],
    afterOrgs: Organization[],
    effectiveDate: string,
  ): Promise<{ buffer: ArrayBuffer; fileName: string }> {
    const allOrgs = [
      ...beforeOrgs,
      ...afterOrgs.filter(o => !beforeOrgs.find(b => b.id === o.id)),
    ]
    const rows = toAllocationRows(allocationList, allOrgs)
    return buildExportBuffer(rows, effectiveDate)
  },

  successMessage(fileName: string): string {
    return `「${fileName}」のエクスポートが完了しました。`
  },

  abortMessage(): string {
    return 'エクスポートをキャンセルしました。'
  },

  errorMessage(err: unknown): string {
    return `エクスポートエラーが発生しました: ${String(err)}`
  },
}
