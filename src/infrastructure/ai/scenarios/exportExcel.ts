import { delay } from './delay'
import { buildExportBuffer } from '../../excel/engine'
import { toAllocationRows } from '../../allocationListMapper'
import type { Organization } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'

export const exportExcelScenario = {
  async startMessage(): Promise<string> {
    await delay(500)
    return 'Excelファイルのエクスポートを開始します...'
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
