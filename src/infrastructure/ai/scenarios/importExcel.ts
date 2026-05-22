import { delay } from './delay'
import { importFromFile } from '../../excel/engine'
import type { ImportedWorkbookResult, ProgressCallback } from '../../excel/types'

export const importExcelScenario = {
  async initialMessage(): Promise<string> {
    await delay(700)
    return 'Excelファイルを選択してください。要員配置リスト・組織CD一覧・各種TBLシートが含まれたファイルに対応しています。'
  },

  loadFile(file: File, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult> {
    return importFromFile(file, onProgress)
  },

  successMessage(result: ImportedWorkbookResult): string {
    return `読み込みが完了しました。\n\n• 要員データ: ${result.allocationRowCount.toLocaleString()} 件\n• 組織データ: ${result.orgEntries.length} 件\n\n続けて操作を選択してください。`
  },

  errorMessage(err: unknown): string {
    return `読み込みエラーが発生しました: ${String(err)}\n別のファイルで試してください。`
  },
}
